import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TuttiFruttiValidatorService } from '../tutti-frutti/tutti-frutti.service';
import { StatsService } from '../stats/stats.service';
import {
  buildAiPlan,
  Dificultad,
  LETRAS,
  outcomeOf,
  revealedAiAnswers,
  scoreAi,
  TEMATICAS,
} from './solo-quick';

@Injectable()
export class SoloMatchesService {
  private readonly LETTERS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

  constructor(
    private prisma: PrismaService,
    private aiValidator: TuttiFruttiValidatorService,
    private stats: StatsService,
  ) {}

  // ─── Partida rápida contra la máquina (la que usa el frontend) ───────────────────────────

  async startQuickMatch(userId: string, dto: { tematica: string; dificultad: string; tiempo: number }) {
    const categories = TEMATICAS[dto.tematica];
    const letter = LETRAS[Math.floor(Math.random() * LETRAS.length)];

    const match = await this.prisma.matches.create({
      data: {
        room_id: null,
        user_id: userId,
        mode: 'vs_ai',
        ai_difficulty: dto.dificultad,
        tematica: dto.tematica,
        round_seconds: dto.tiempo,
        status: 'in_progress',
      },
    });
    const round = await this.prisma.rounds.create({
      data: { match_id: match.id, round_number: 1, letter, status: 'answering' },
    });

    return {
      matchId: match.id,
      letter,
      categories,
      roundSeconds: dto.tiempo,
      // El frontend usa el plan para mostrar a la máquina "escribiendo". El resultado oficial
      // se recalcula en finishQuickMatch con el tiempo medido por el servidor.
      aiPlan: buildAiPlan(match.id, letter, categories, dto.dificultad as Dificultad),
      startedAt: round.started_at,
    };
  }

  async finishQuickMatch(
    userId: string,
    matchId: string,
    answers: { category: string; answer?: string | null }[],
  ) {
    const match = await this.prisma.matches.findUnique({
      where: { id: matchId },
      include: { rounds: { orderBy: { round_number: 'asc' }, take: 1 } },
    });
    const round = match?.rounds[0];
    if (!match || match.user_id !== userId || match.mode !== 'vs_ai' || !round || !match.tematica) {
      throw new NotFoundException('Partida no encontrada');
    }

    // "Reservamos" la partida para que terminarla dos veces no sume estadísticas dos veces
    const claimed = await this.prisma.matches.updateMany({
      where: { id: matchId, status: 'in_progress' },
      data: { status: 'validating' },
    });
    if (claimed.count === 0) throw new ConflictException('Esta partida ya terminó');

    try {
      const categories = TEMATICAS[match.tematica] ?? [];
      const playerAnswers: Record<string, string | null> = {};
      for (const c of categories) {
        const sent = answers.find((a) => a.category === c)?.answer?.trim();
        playerAnswers[c] = sent ? sent : null;
      }

      const validation = await this.aiValidator.validateRound({
        roundLetter: round.letter,
        answers: categories.map((c) => ({ category: c, answer: playerAnswers[c] })),
      });
      const playerPoints = validation.totalPoints;

      // La máquina tuvo el tiempo real que pasó (medido acá), con tope en la duración de la ronda
      const elapsedMs = Math.min(
        Date.now() - round.started_at.getTime(),
        (match.round_seconds ?? 60) * 1000,
      );
      const plan = buildAiPlan(match.id, round.letter, categories, (match.ai_difficulty ?? 'medio') as Dificultad);
      const aiAnswers = revealedAiAnswers(plan, elapsedMs);
      const aiPoints = scoreAi(aiAnswers, playerAnswers);
      const outcome = outcomeOf(playerPoints, aiPoints);

      const categoryRows = await this.prisma.categories.findMany({
        where: { name: { in: categories } },
        select: { id: true, name: true },
      });
      const categoryIdByName = new Map(categoryRows.map((c) => [c.name, c.id]));

      const profile = await this.prisma.$transaction(async (tx) => {
        for (const r of validation.results) {
          const categoryId = categoryIdByName.get(r.category);
          if (!categoryId) continue; // categoría no sembrada en la base: se puntúa igual, no se guarda
          await tx.answers.create({
            data: {
              round_id: round.id,
              room_player_id: null,
              category_id: categoryId,
              answer_text: playerAnswers[r.category],
              is_valid: r.isValid,
              points: r.points,
              validated_by: 'ai',
            },
          });
        }
        await tx.rounds.update({ where: { id: round.id }, data: { status: 'finished', finished_at: new Date() } });
        await tx.matches.update({ where: { id: matchId }, data: { status: 'finished', finished_at: new Date() } });
        return this.stats.recordMatchResult(userId, { won: outcome === 'win', points: playerPoints }, tx);
      });

      return {
        matchId,
        letter: round.letter,
        results: validation.results,
        playerPoints,
        aiAnswers,
        aiPoints,
        outcome,
        stats: {
          matchesPlayed: profile.matches_played,
          matchesWon: profile.matches_won,
          totalPoints: profile.total_points,
          currentStreak: profile.current_streak,
          bestStreak: profile.best_streak,
        },
      };
    } catch (e) {
      // Si algo falló, liberamos la partida para poder reintentar
      await this.prisma.matches.updateMany({
        where: { id: matchId, status: 'validating' },
        data: { status: 'in_progress' },
      });
      throw e;
    }
  }

  // ─── Flujo por rondas (API anterior; el frontend actual no la usa) ───────────────────────

  async startMatch(
    userId: string,
    dto: { categoryIds: string[]; roundSeconds: number; aiDifficulty: string },
  ) {
    const match = await this.prisma.matches.create({
      data: {
        room_id: null,
        mode: 'vs_ai',
        ai_difficulty: dto.aiDifficulty,
        status: 'in_progress',
      },
    });

    const round = await this.startNewRound(match.id, 1);

    return { match, round, categoryIds: dto.categoryIds, roundSeconds: dto.roundSeconds, userId };
  }

  async startNewRound(matchId: string, roundNumber: number) {
    const previousRounds = await this.prisma.rounds.findMany({
      where: { match_id: matchId },
      select: { letter: true },
    });
    const usedLetters = previousRounds.map((r) => r.letter);
    const availableLetters = this.LETTERS.filter((l) => !usedLetters.includes(l));

    if (availableLetters.length === 0) {
      throw new BadRequestException('Ya se usaron todas las letras disponibles');
    }

    const letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];

    return this.prisma.rounds.create({
      data: {
        match_id: matchId,
        round_number: roundNumber,
        letter,
        status: 'answering',
      },
    });
  }

  async submitAnswers(
    matchId: string,
    roundId: string,
    answers: { categoryId: string; answerText: string | null }[],
  ) {
    const round = await this.prisma.rounds.findUnique({ where: { id: roundId } });

    if (!round) throw new NotFoundException('Ronda no encontrada');
    if (round.match_id !== matchId) throw new BadRequestException('La ronda no pertenece a ese match');
    if (round.status !== 'answering') {
      throw new BadRequestException('Esta ronda ya no acepta respuestas');
    }

    // En modo solo no hay room_player (es null), por eso usamos category_id como única referencia
    // junto al round_id. Borramos respuestas previas de esa ronda antes de insertar (simplifica el upsert).
    await this.prisma.answers.deleteMany({
      where: { round_id: roundId, room_player_id: null },
    });

    const created = await this.prisma.$transaction(
      answers.map((a) =>
        this.prisma.answers.create({
          data: {
            round_id: roundId,
            room_player_id: null,
            category_id: a.categoryId,
            answer_text: a.answerText,
            validated_by: 'pending',
          },
        }),
      ),
    );

    return { answersSubmitted: created.length };
  }

  async validateRoundWithAi(matchId: string, roundId: string) {
    const round = await this.prisma.rounds.findUnique({
      where: { id: roundId },
      include: {
        answers: { include: { category: true } },
      },
    });

    if (!round) throw new NotFoundException('Ronda no encontrada');
    if (round.match_id !== matchId) throw new BadRequestException('La ronda no pertenece a ese match');
    if (round.status !== 'answering') {
      throw new BadRequestException('Esta ronda ya fue validada');
    }

    const dtoForAi = {
      roundLetter: round.letter,
      answers: round.answers.map((a) => ({
        category: a.category.name,
        answer: a.answer_text,
      })),
    } as any;

    const aiResult = await this.aiValidator.validateRound(dtoForAi);

    // Mapeamos el resultado de la IA de vuelta a cada `answer` por categoría
    const updates = round.answers.map((a) => {
      const aiMatch = aiResult.results.find((r) => r.category === a.category.name);
      const isValid = aiMatch?.isValid ?? false;
      const points = aiMatch?.points ?? 0;

      return this.prisma.answers.update({
        where: { id: a.id },
        data: { is_valid: isValid, points, validated_by: 'ai' },
      });
    });

    const finalAnswers = await this.prisma.$transaction(updates);

    await this.prisma.rounds.update({
      where: { id: roundId },
      data: { status: 'finished', finished_at: new Date() },
    });

    const totalPoints = finalAnswers.reduce((sum, a) => sum + a.points, 0);

    return { answers: finalAnswers, totalPoints, aiRaw: aiResult };
  }
} 