import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0/I/1 para evitar confusión visual
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  async create(dto: CreateRoomDto, userId: string) {
    let code = this.generateRoomCode();

    // Reintentar si el código ya existe (muy improbable, pero por las dudas)
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
} 