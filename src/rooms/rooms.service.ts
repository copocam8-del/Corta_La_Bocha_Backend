import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { scoreCategory, type AnswerStatus, type CategoryEntry } from '../tutti-frutti/scoring';
import { AchievementsService, UnlockedAchievement } from '../achievements/achievements.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class RoomsService {
  private readonly LETTERS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

  constructor(
    private prisma: PrismaService,
    private stats: StatsService,
    private achievements: AchievementsService,
  ) {}

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  async create(dto: CreateRoomDto, userId: string) {
    let code = this.generateRoomCode();

    let exists = await this.prisma.rooms.findUnique({ where: { room_code: code } });
    while (exists) {
      code = this.generateRoomCode();
      exists = await this.prisma.rooms.findUnique({ where: { room_code: code } });
    }

    const room = await this.prisma.rooms.create({
      data: {
        room_code: code,
        is_private: dto.is_private ?? false,
        max_players: dto.max_players ?? 8,
        status: 'waiting',
        room_players: {
          create: { user_id: userId },
        },
      },
      include: {
        room_players: { include: { user: { select: { id: true, username: true } } } },
      },
    });

    return room;
  }

  async joinByCode(code: string, userId: string) {
    const room = await this.prisma.rooms.findUnique({
      where: { room_code: code.toUpperCase() },
      include: { room_players: true },
    });

    if (!room) throw new NotFoundException('Sala no encontrada');
    if (room.status !== 'waiting') throw new BadRequestException('La partida ya comenzó');
    if (room.room_players.length >= room.max_players) {
      throw new BadRequestException('La sala está llena');
    }

    const alreadyJoined = room.room_players.some((p) => p.user_id === userId);
    if (alreadyJoined) {
      return this.findByCode(code);
    }

    await this.prisma.room_players.create({
      data: { room_id: room.id, user_id: userId },
    });

    return this.findByCode(code);
  }

  async findByCode(code: string) {
    const room = await this.prisma.rooms.findUnique({
      where: { room_code: code.toUpperCase() },
      include: {
        room_players: {
          include: { user: { select: { id: true, username: true } } },
        },
      },
    });

    if (!room) throw new NotFoundException('Sala no encontrada');
    return room;
  }

  async findPublicRooms() {
    return this.prisma.rooms.findMany({
      where: { is_private: false, status: 'waiting' },
      include: {
        room_players: { select: { id: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async startMatch(
    roomCode: string,
    userId: string,
    dto: { categoryIds: string[]; roundSeconds: number },
  ) {
    const room = await this.prisma.rooms.findUnique({
      where: { room_code: roomCode.toUpperCase() },
      include: { room_players: true },
    });

    if (!room) throw new NotFoundException('Sala no encontrada');

    const isPlayerInRoom = room.room_players.some((p) => p.user_id === userId);
    if (!isPlayerInRoom) throw new BadRequestException('No formás parte de esta sala');

    if (room.status === 'playing') {
      throw new BadRequestException('La partida ya está en curso');
    }

    const match = await this.prisma.matches.create({
      data: {
        room_id: room.id,
        mode: 'multiplayer',
        status: 'in_progress',
      },
    });

    await this.prisma.rooms.update({
      where: { id: room.id },
      data: { status: 'playing' },
    });

    const round = await this.startNewRound(match.id, 1);

    return { match, round, categoryIds: dto.categoryIds, roundSeconds: dto.roundSeconds };
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

    const round = await this.prisma.rounds.create({
      data: {
        match_id: matchId,
        round_number: roundNumber,
        letter,
        status: 'answering',
      },
    });

    return round;
  }

  async submitAnswers(
    matchId: string,
    roundId: string,
    userId: string,
    answers: { categoryId: string; answerText: string | null }[],
  ) {
    const round = await this.prisma.rounds.findUnique({
      where: { id: roundId },
      include: { match: true },
    });

    if (!round) throw new NotFoundException('Ronda no encontrada');
    if (round.match_id !== matchId) throw new BadRequestException('La ronda no pertenece a ese match');
    if (round.status !== 'answering') {
      throw new BadRequestException('Esta ronda ya no acepta respuestas');
    }

    const roomPlayer = await this.prisma.room_players.findFirst({
      where: { user_id: userId, room_id: round.match.room_id ?? undefined },
    });

    if (!roomPlayer) throw new BadRequestException('No formás parte de esta partida');

    const created = await this.prisma.$transaction(
      answers.map((a) =>
        this.prisma.answers.upsert({
          where: {
            round_id_room_player_id_category_id: {
              round_id: roundId,
              room_player_id: roomPlayer.id,
              category_id: a.categoryId,
            },
          },
          update: { answer_text: a.answerText },
          create: {
            round_id: roundId,
            room_player_id: roomPlayer.id,
            category_id: a.categoryId,
            answer_text: a.answerText,
            validated_by: 'pending',
          },
        }),
      ),
    );

    return { roomPlayerId: roomPlayer.id, answersSubmitted: created.length };
  }

  /**
   * Lógica interna compartida: cierra una ronda y devuelve sus respuestas.
   * No valida pertenencia a la sala (eso lo hace el caller según el contexto).
   */
  private async doCloseRoundForVoting(roundId: string) {
    const updated = await this.prisma.rounds.update({
      where: { id: roundId },
      data: { status: 'voting' },
    });

    const answers = await this.prisma.answers.findMany({
      where: { round_id: roundId },
      include: {
        category: { select: { id: true, name: true } },
        room_player: { include: { user: { select: { id: true, username: true } } } },
      },
    });

    return { round: updated, answers };
  }

  async closeRoundForVoting(matchId: string, roundId: string, userId: string) {
    const round = await this.prisma.rounds.findUnique({
      where: { id: roundId },
      include: { match: true },
    });

    if (!round) throw new NotFoundException('Ronda no encontrada');
    if (round.match_id !== matchId) throw new BadRequestException('La ronda no pertenece a ese match');
    if (round.status !== 'answering') {
      throw new BadRequestException('Esta ronda no está en estado de respuesta');
    }

    const roomPlayer = await this.prisma.room_players.findFirst({
      where: { user_id: userId, room_id: round.match.room_id ?? undefined },
    });
    if (!roomPlayer) throw new BadRequestException('No formás parte de esta partida');

    return this.doCloseRoundForVoting(roundId);
  }

  /**
   * Versión "silenciosa" para el timer automático: si la ronda ya no está
   * en estado `answering` (porque alguien la cerró a mano antes de que
   * venza el tiempo), simplemente no hace nada y devuelve null, en vez
   * de tirar una excepción que rompería el timer.
   */
  async closeRoundForVotingIfStillAnswering(matchId: string, roundId: string) {
    const round = await this.prisma.rounds.findUnique({ where: { id: roundId } });

    if (!round) return null;
    if (round.match_id !== matchId) return null;
    if (round.status !== 'answering') return null;

    return this.doCloseRoundForVoting(roundId);
  }

  async voteAnswer(answerId: string, voterUserId: string, approve: boolean) {
    const answer = await this.prisma.answers.findUnique({
      where: { id: answerId },
      include: { round: true, room_player: true },
    });

    if (!answer) throw new NotFoundException('Respuesta no encontrada');
    if (answer.round.status !== 'voting') {
      throw new BadRequestException('Esta ronda no está en etapa de votación');
    }

    const matchOfAnswer = await this.prisma.matches.findUnique({ where: { id: answer.round.match_id } });
    const voter = await this.prisma.room_players.findFirst({
      where: { user_id: voterUserId, room_id: matchOfAnswer?.room_id ?? undefined },
    });

    if (!voter) throw new BadRequestException('No formás parte de esta partida');

    if (answer.room_player_id === voter.id) {
      throw new BadRequestException('No podés votar tu propia respuesta');
    }

    const vote = await this.prisma.votes.upsert({
      where: {
        answer_id_user_id: {
          answer_id: answerId,
          user_id: voterUserId,
        },
      },
      update: { approve },
      create: {
        answer_id: answerId,
        room_player_id: voter.id,
        user_id: voterUserId,
        approve,
      },
    });

    return vote;
  }

  async tallyRoundVotes(matchId: string, roundId: string, userId: string) {
    const round = await this.prisma.rounds.findUnique({
      where: { id: roundId },
      include: { match: true },
    });

    if (!round) throw new NotFoundException('Ronda no encontrada');
    if (round.match_id !== matchId) throw new BadRequestException('La ronda no pertenece a ese match');

    const roomPlayer = await this.prisma.room_players.findFirst({
      where: { user_id: userId, room_id: round.match.room_id ?? undefined },
    });
    if (!roomPlayer) throw new BadRequestException('No formás parte de esta partida');

    // Sólo se cuenta una vez: si dos jugadores piden el conteo a la vez, el segundo no suma
    // puntos de nuevo. Pasamos la ronda de "voting" a "tallying" de forma atómica.
    const claimed = await this.prisma.rounds.updateMany({
      where: { id: roundId, status: 'voting' },
      data: { status: 'tallying' },
    });
    if (claimed.count === 0) throw new ConflictException('Esta ronda no está en etapa de votación');

    const answers = await this.prisma.answers.findMany({
      where: { round_id: roundId },
      include: { votes: true },
    });

    // Validez por votos: vale si tiene al menos tantos votos a favor como en contra.
    // Puntaje: el mismo de la partida contra la máquina (tutti-frutti/scoring.ts): 20 si es la única
    // válida de la categoría, 10 si nadie más puso lo mismo, 5 si se repite, 0 si no vale.
    const statusOf = (a: (typeof answers)[number]): AnswerStatus => {
      if (!a.answer_text || a.answer_text.trim() === '') return 'empty';
      const approvals = a.votes.filter((v) => v.approve).length;
      const rejections = a.votes.filter((v) => !v.approve).length;
      return approvals >= rejections ? 'valid' : 'invalid';
    };

    const byCategory = new Map<string, CategoryEntry[]>();
    for (const a of answers) {
      const list = byCategory.get(a.category_id) ?? [];
      list.push({ playerId: a.id, status: statusOf(a), canonical: a.answer_text });
      byCategory.set(a.category_id, list);
    }
    const pointsByAnswer: Record<string, number> = {};
    for (const entries of byCategory.values()) Object.assign(pointsByAnswer, scoreCategory(entries));

    const updates = answers.map((a) =>
      this.prisma.answers.update({
        where: { id: a.id },
        data: { is_valid: statusOf(a) === 'valid', points: pointsByAnswer[a.id] ?? 0, validated_by: 'votes' },
      }),
    );

    const finalAnswers = await this.prisma.$transaction(updates);

    await this.prisma.rounds.update({
      where: { id: roundId },
      data: { status: 'finished', finished_at: new Date() },
    });

    const pointsByRoomPlayer: Record<string, number> = {};
    for (const a of finalAnswers) {
      if (!a.room_player_id) continue;
      pointsByRoomPlayer[a.room_player_id] = (pointsByRoomPlayer[a.room_player_id] ?? 0) + a.points;
    }

    for (const [roomPlayerId, points] of Object.entries(pointsByRoomPlayer)) {
      const rp = await this.prisma.room_players.findUnique({ where: { id: roomPlayerId } });
      if (!rp) continue;
      await this.prisma.profiles.upsert({
        where: { user_id: rp.user_id },
        update: { total_points: { increment: points } },
        create: { user_id: rp.user_id, total_points: points },
      });
    }

    return { answers: finalAnswers, pointsByRoomPlayer };
  }

  /**
   * Termina una partida multijugador: decide el ganador y actualiza las estadísticas de
   * todos los jugadores de la sala (partidas jugadas/ganadas y rachas). Los puntos ya se
   * sumaron ronda por ronda en tallyRoundVotes, así que acá no se vuelven a sumar.
   * Si hay empate en el primer puesto, ganan todos los empatados (siempre que hayan sumado puntos).
   */
  async finishMatch(roomCode: string, matchId: string, userId: string) {
    const room = await this.prisma.rooms.findUnique({
      where: { room_code: roomCode.toUpperCase() },
      include: { room_players: { include: { user: { select: { id: true, username: true } } } } },
    });
    if (!room) throw new NotFoundException('Sala no encontrada');
    if (!room.room_players.some((p) => p.user_id === userId)) {
      throw new BadRequestException('No formás parte de esta sala');
    }

    const match = await this.prisma.matches.findUnique({
      where: { id: matchId },
      include: { rounds: { select: { id: true, status: true } } },
    });
    if (!match || match.room_id !== room.id) throw new NotFoundException('Partida no encontrada');
    if (match.rounds.some((r) => r.status !== 'finished')) {
      throw new BadRequestException('Todavía hay rondas sin terminar');
    }

    // Se termina una sola vez (evita sumar dos veces las estadísticas)
    const claimed = await this.prisma.matches.updateMany({
      where: { id: matchId, status: 'in_progress' },
      data: { status: 'finished', finished_at: new Date() },
    });
    if (claimed.count === 0) throw new ConflictException('Esta partida ya terminó');

    const answers = await this.prisma.answers.findMany({
      where: { round: { match_id: matchId }, room_player_id: { not: null } },
      select: { room_player_id: true, points: true },
    });
    const totals: Record<string, number> = {};
    for (const p of room.room_players) totals[p.id] = 0;
    for (const a of answers) {
      if (a.room_player_id && a.room_player_id in totals) totals[a.room_player_id] += a.points;
    }
    const best = Math.max(0, ...Object.values(totals));

    const standings = room.room_players
      .map((p) => ({
        userId: p.user_id,
        username: p.user.username,
        points: totals[p.id] ?? 0,
        won: best > 0 && totals[p.id] === best,
      }))
      .sort((a, b) => b.points - a.points);

    const newAchievements: Record<string, UnlockedAchievement[]> = {};
    await this.prisma.$transaction(async (tx) => {
      for (const s of standings) {
        const updated = await this.stats.recordMatchResult(s.userId, { won: s.won, points: 0 }, tx);
        newAchievements[s.userId] = await this.achievements.unlockFor(
          s.userId,
          {
            matchesPlayed: updated.matches_played,
            matchesWon: updated.matches_won,
            totalPoints: updated.total_points,
            currentStreak: updated.current_streak,
            mode: 'multiplayer',
            won: s.won,
          },
          tx,
        );
      }
      await tx.rooms.update({ where: { id: room.id }, data: { status: 'waiting' } });
    });

    return {
      matchId,
      standings: standings.map((s) => ({ ...s, newAchievements: newAchievements[s.userId] ?? [] })),
    };
  }
} 