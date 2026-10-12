import { Injectable, NotFoundException, BadRequestException, ConflictException, GoneException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TuttiFruttiValidatorService } from '../tutti-frutti/tutti-frutti.service';
import { StatsService } from '../stats/stats.service';
import { AchievementsService } from '../achievements/achievements.service';
import {
  ABANDONO_CUENTA_HASTA_MS,
  BASTA_MARGEN_MS,
  buildAiPlan,
  completoTodo,
  Dificultad,
  GRACIA_MS,
  letrasDe,
  outcomeOf,
  revealedAiAnswers,
  TEMATICAS,
} from './solo-quick';
import { scoreRound, type CategoryEntry } from '../tutti-frutti/scoring';

@Injectable()
export class SoloMatchesService {
  constructor(
    private prisma: PrismaService,
    private aiValidator: TuttiFruttiValidatorService,
    private stats: StatsService,
    private achievements: AchievementsService,
  ) {}

  // ─── Partida rápida contra la máquina (la que usa el frontend) ───────────────────────────

  async startQuickMatch(userId: string, dto: { tematica: string; dificultad: string; tiempo: number }) {
    // Antes de empezar otra, cerramos las que el jugador dejó tiradas (cuentan como perdidas)
    await this.closeAbandonedMatches(userId);

    const categories = TEMATICAS[dto.tematica];
    const letras = letrasDe(dto.tematica);
    const letter = letras[Math.floor(Math.random() * letras.length)];

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
    // started_at con la hora de ESTE servidor (no el now() de la base): la columna no guarda zona
    // horaria y si la base no está en UTC el tiempo de la máquina se calcularía mal
    const round = await this.prisma.rounds.create({
      data: { match_id: match.id, round_number: 1, letter, status: 'answering', started_at: new Date() },
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
    if (match.status !== 'in_progress') throw new ConflictException('Esta partida ya terminó');

    const roundMs = (match.round_seconds ?? 60) * 1000;
    const elapsedRaw = Date.now() - round.started_at.getTime();

    // Respuestas que llegan mucho después del final: la partida se dio por abandonada
    if (elapsedRaw > roundMs + GRACIA_MS) {
      await this.abandonMatch(match.id, userId, true);
      throw new GoneException('La partida venció: pasó demasiado tiempo desde que terminó la ronda. Cuenta como perdida.');
    }

    const categoriasDeLaPartida = TEMATICAS[match.tematica] ?? [];
    const enviadas = Object.fromEntries(
      categoriasDeLaPartida.map((c) => [c, answers.find((a) => a.category === c)?.answer ?? null]),
    );
    if (elapsedRaw < roundMs - BASTA_MARGEN_MS && !completoTodo(categoriasDeLaPartida, enviadas)) {
      throw new BadRequestException('Para cantar ¡Basta! tenés que completar todas las categorías.');
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

      // La máquina tuvo el tiempo real que pasó (medido acá), con tope en la duración de la ronda
      const elapsedMs = Math.min(elapsedRaw, roundMs);
      const plan = buildAiPlan(match.id, round.letter, categories, (match.ai_difficulty ?? 'medio') as Dificultad);
      const machineAnswers = revealedAiAnswers(plan, elapsedMs);

      // Las respuestas del jugador y de la máquina se validan JUNTAS, con las mismas reglas,
      // en una sola llamada a la IA
      const checks = await this.aiValidator.validateAnswers(round.letter, [
        ...categories.map((c) => ({ key: `jugador:${c}`, category: c, answer: playerAnswers[c] })),
        ...categories.map((c) => ({ key: `maquina:${c}`, category: c, answer: machineAnswers[c] ?? null })),
      ]);

      // Puntaje clásico: la máquina cuenta como un jugador más
      const byCategory: Record<string, CategoryEntry[]> = {};
      for (const c of categories) {
        const j = checks.get(`jugador:${c}`)!;
        const m = checks.get(`maquina:${c}`)!;
        byCategory[c] = [
          { playerId: 'jugador', status: j.status, canonical: j.canonical ?? playerAnswers[c] },
          { playerId: 'maquina', status: m.status, canonical: m.canonical ?? machineAnswers[c] ?? null },
        ];
      }
      const scores = scoreRound(byCategory);
      const playerPoints = scores.jugador?.total ?? 0;
      const aiPoints = scores.maquina?.total ?? 0;
      const outcome = outcomeOf(playerPoints, aiPoints);

      const results = categories.map((c) => {
        const j = checks.get(`jugador:${c}`)!;
        const m = checks.get(`maquina:${c}`)!;
        return {
          category: c,
          userAnswer: playerAnswers[c],
          status: j.status,
          isValid: j.status === 'valid',
          canonical: j.canonical,
          reason: j.reason,
          points: scores.jugador?.byCategory[c] ?? 0,
          machine: {
            answer: machineAnswers[c] ?? null,
            status: m.status,
            isValid: m.status === 'valid',
            canonical: m.canonical,
            reason: m.reason,
            points: scores.maquina?.byCategory[c] ?? 0,
          },
        };
      });

      // Si la IA no respondió, alguna respuesta quedó "sin validar" (0 puntos). Esa partida no es
      // justa: se termina igual, pero no cuenta para estadísticas, ranking ni logros.
      const validationIncomplete = [...checks.values()].some((c) => c.status === 'unverified');
      const allAnswersValid = results.every((r) => r.isValid);

      const categoryRows = await this.prisma.categories.findMany({
        where: { name: { in: categories } },
        select: { id: true, name: true },
      });
      const categoryIdByName = new Map(categoryRows.map((c) => [c.name, c.id]));

      const { profile, newAchievements } = await this.prisma.$transaction(async (tx) => {
        for (const r of results) {
          const categoryId = categoryIdByName.get(r.category);
          if (!categoryId) continue; // categoría no sembrada en la base: se puntúa igual, no se guarda
          await tx.answers.create({
            data: {
              round_id: round.id,
              room_player_id: null,
              category_id: categoryId,
              answer_text: r.userAnswer,
              is_valid: r.status === 'unverified' ? null : r.isValid,
              points: r.points,
              validated_by: r.status === 'unverified' ? 'unverified' : 'ai',
            },
          });
        }
        await tx.rounds.update({ where: { id: round.id }, data: { status: 'finished', finished_at: new Date() } });
        await tx.matches.update({ where: { id: matchId }, data: { status: 'finished', finished_at: new Date() } });
        if (validationIncomplete) return { profile: null, newAchievements: [] };

        const updated = await this.stats.recordMatchResult(userId, { won: outcome === 'win', points: playerPoints }, tx);
        const unlocked = await this.achievements.unlockFor(
          userId,
          {
            matchesPlayed: updated.matches_played,
            matchesWon: updated.matches_won,
            totalPoints: updated.total_points,
            currentStreak: updated.current_streak,
            mode: 'vs_ai',
            won: outcome === 'win',
            aiDifficulty: match.ai_difficulty,
            allAnswersValid,
          },
          tx,
        );
        return { profile: updated, newAchievements: unlocked };
      });

      return {
        matchId,
        letter: round.letter,
        results,
        playerPoints,
        aiAnswers: machineAnswers,
        aiPoints,
        outcome,
        validationIncomplete,
        newAchievements,
        stats: profile && {
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

  // Partidas del usuario que quedaron "en juego" después de su tiempo (cerró la pestaña, se fue
  // a otra página): se cierran. Las recientes cuentan como perdidas, así nadie evita una derrota
  // (ni corta su racha) abandonando; las muy viejas se cierran sin tocar estadísticas.
  async closeAbandonedMatches(userId: string, now = Date.now()) {
    const open = await this.prisma.matches.findMany({
      where: { user_id: userId, mode: 'vs_ai', status: 'in_progress' },
      select: { id: true, round_seconds: true, created_at: true, rounds: { select: { started_at: true }, take: 1 } },
    });
    for (const m of open) {
      const started = (m.rounds[0]?.started_at ?? m.created_at).getTime();
      const expired = now - started > (m.round_seconds ?? 60) * 1000 + GRACIA_MS;
      if (expired) await this.abandonMatch(m.id, userId, now - started < ABANDONO_CUENTA_HASTA_MS);
    }
  }

  private async abandonMatch(matchId: string, userId: string, countsAsLoss: boolean) {
    await this.prisma.$transaction(async (tx) => {
      // Sólo si sigue "en juego": si justo se está terminando, no la tocamos (no se cuenta dos veces)
      const claimed = await tx.matches.updateMany({
        where: { id: matchId, status: 'in_progress' },
        data: { status: 'abandoned', finished_at: new Date() },
      });
      if (claimed.count === 0) return;
      await tx.rounds.updateMany({ where: { match_id: matchId }, data: { status: 'finished', finished_at: new Date() } });
      if (countsAsLoss) await this.stats.recordMatchResult(userId, { won: false, points: 0 }, tx);
    });
  }
}
