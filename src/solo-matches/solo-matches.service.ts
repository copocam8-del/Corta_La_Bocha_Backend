import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TuttiFruttiValidatorService } from '../tutti-frutti/tutti-frutti.service';

@Injectable()
export class SoloMatchesService {
  private readonly LETTERS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

  constructor(
    private prisma: PrismaService,
    private aiValidator: TuttiFruttiValidatorService,
  ) {}

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