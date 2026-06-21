import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class RoomsService {
  private readonly LETTERS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

  constructor(private prisma: PrismaService) {}

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

  async voteAnswer(answerId: string, voterUserId: string, approve: boolean) {
    const answer = await this.prisma.answers.findUnique({
      where: { id: answerId },
      include: { round: true, room_player: true },
    });

    if (!answer) throw new NotFoundException('Respuesta no encontrada');
    if (answer.round.status !== 'voting') {
      throw new BadRequestException('Esta ronda no está en etapa de votación');
    }

    const voterRoomPlayer = await this.prisma.room_players.findFirst({
      where: { user_id: voterUserId, room_id: answer.round.match_id ? undefined : undefined },
    });

    // Buscamos el room_player del votante dentro de la misma sala que la respuesta
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

  async tallyRoundVotes(matchId: string, roundId: string) {
    const round = await this.prisma.rounds.findUnique({
      where: { id: roundId },
      include: { match: true },
    });

    if (!round) throw new NotFoundException('Ronda no encontrada');
    if (round.match_id !== matchId) throw new BadRequestException('La ronda no pertenece a ese match');

    const answers = await this.prisma.answers.findMany({
      where: { round_id: roundId },
      include: { votes: true },
    });

    // Para detectar respuestas repetidas entre jugadores, agrupamos por categoría + texto normalizado
    const normalize = (s: string | null) =>
      (s ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const groupCount: Record<string, number> = {};
    for (const a of answers) {
      if (!a.answer_text) continue;
      const key = `${a.category_id}::${normalize(a.answer_text)}`;
      groupCount[key] = (groupCount[key] ?? 0) + 1;
    }

    const updates = answers.map((a) => {
      let isValid = false;
      let points = 0;

      if (!a.answer_text || a.answer_text.trim() === '') {
        isValid = false;
        points = 0;
      } else {
        const approvals = a.votes.filter((v) => v.approve).length;
        const rejections = a.votes.filter((v) => !v.approve).length;
        // Empate o más a favor => válida (beneficio de la duda)
        isValid = approvals >= rejections;

        if (isValid) {
          const key = `${a.category_id}::${normalize(a.answer_text)}`;
          const isRepeated = (groupCount[key] ?? 0) > 1;
          points = isRepeated ? 5 : 10;
        } else {
          points = 0;
        }
      }

      return this.prisma.answers.update({
        where: { id: a.id },
        data: { is_valid: isValid, points, validated_by: 'votes' },
      });
    });

    const finalAnswers = await this.prisma.$transaction(updates);

    await this.prisma.rounds.update({
      where: { id: roundId },
      data: { status: 'finished', finished_at: new Date() },
    });

    // Sumamos los puntos al perfil de cada jugador
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
} 