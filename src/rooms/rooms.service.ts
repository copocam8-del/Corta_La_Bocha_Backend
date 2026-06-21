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
} 