import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { AchievementsService } from '../achievements/achievements.service';

describe('RoomsService', () => {
  let service: RoomsService;

  const prisma = {
    rooms: { findUnique: jest.fn(), update: jest.fn() },
    rounds: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    matches: { findUnique: jest.fn(), updateMany: jest.fn() },
    answers: { findMany: jest.fn(), update: jest.fn() },
    room_players: { findFirst: jest.fn(), findUnique: jest.fn() },
    profiles: { upsert: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
    ),
  };
  const stats = { recordMatchResult: jest.fn() };
  const achievements = { unlockFor: jest.fn() };
  const perfil = { matches_played: 1, matches_won: 1, total_points: 20, current_streak: 1, best_streak: 1 };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatsService, useValue: stats },
        { provide: AchievementsService, useValue: achievements },
      ],
    }).compile();
    service = module.get(RoomsService);
    stats.recordMatchResult.mockResolvedValue(perfil);
    achievements.unlockFor.mockResolvedValue([]);
  });

  describe('tallyRoundVotes', () => {
    beforeEach(() => {
      prisma.rounds.findUnique.mockResolvedValue({ id: 'r1', match_id: 'm1', match: { room_id: 'room1' } });
      prisma.room_players.findFirst.mockResolvedValue({ id: 'rp1' });
    });

    it('no vuelve a sumar puntos si la ronda ya se contó', async () => {
      prisma.rounds.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.tallyRoundVotes('m1', 'r1', 'u1')).rejects.toThrow(ConflictException);
      expect(prisma.profiles.upsert).not.toHaveBeenCalled();
    });

    it('sólo puede pedir el conteo alguien de la sala', async () => {
      prisma.room_players.findFirst.mockResolvedValue(null);
      await expect(service.tallyRoundVotes('m1', 'r1', 'intruso')).rejects.toThrow(BadRequestException);
    });
  });

  describe('finishMatch', () => {
    const sala = {
      id: 'room1',
      room_players: [
        { id: 'rp1', user_id: 'u1', user: { id: 'u1', username: 'leo' } },
        { id: 'rp2', user_id: 'u2', user: { id: 'u2', username: 'dibu' } },
        { id: 'rp3', user_id: 'u3', user: { id: 'u3', username: 'fideo' } },
      ],
    };

    beforeEach(() => {
      prisma.rooms.findUnique.mockResolvedValue(sala);
      prisma.matches.findUnique.mockResolvedValue({ id: 'm1', room_id: 'room1', rounds: [{ id: 'r1', status: 'finished' }] });
      prisma.matches.updateMany.mockResolvedValue({ count: 1 });
    });

    it('gana el que más puntos sumó y todos suman una partida (sin volver a sumar puntos)', async () => {
      prisma.answers.findMany.mockResolvedValue([
        { room_player_id: 'rp1', points: 10 },
        { room_player_id: 'rp1', points: 10 },
        { room_player_id: 'rp2', points: 5 },
      ]);

      const res = await service.finishMatch('abc123', 'm1', 'u1');

      expect(res.standings.map((s) => [s.username, s.points, s.won])).toEqual([
        ['leo', 20, true],
        ['dibu', 5, false],
        ['fideo', 0, false],
      ]);
      expect(stats.recordMatchResult).toHaveBeenCalledTimes(3);
      expect(stats.recordMatchResult).toHaveBeenCalledWith('u1', { won: true, points: 0 }, prisma);
      expect(stats.recordMatchResult).toHaveBeenCalledWith('u3', { won: false, points: 0 }, prisma);
    });

    it('otorga logros de multijugador y los devuelve por jugador', async () => {
      prisma.answers.findMany.mockResolvedValue([{ room_player_id: 'rp1', points: 10 }]);
      achievements.unlockFor.mockImplementation((userId: string) =>
        Promise.resolve(userId === 'u1' ? [{ id: 'campeon_del_barrio', name: 'Campeón del barrio', description: '' }] : []),
      );

      const res = await service.finishMatch('abc123', 'm1', 'u1');

      expect(achievements.unlockFor).toHaveBeenCalledWith(
        'u1', expect.objectContaining({ mode: 'multiplayer', won: true }), prisma,
      );
      expect(res.standings.find((s) => s.userId === 'u1')!.newAchievements.map((a) => a.id)).toEqual(['campeon_del_barrio']);
      expect(res.standings.find((s) => s.userId === 'u2')!.newAchievements).toEqual([]);
    });

    it('si empatan arriba, ganan los dos', async () => {
      prisma.answers.findMany.mockResolvedValue([
        { room_player_id: 'rp1', points: 10 },
        { room_player_id: 'rp2', points: 10 },
      ]);
      const res = await service.finishMatch('abc123', 'm1', 'u1');
      expect(res.standings.filter((s) => s.won).map((s) => s.username).sort()).toEqual(['dibu', 'leo']);
    });

    it('si nadie sumó puntos, no gana nadie', async () => {
      prisma.answers.findMany.mockResolvedValue([]);
      const res = await service.finishMatch('abc123', 'm1', 'u1');
      expect(res.standings.every((s) => !s.won)).toBe(true);
    });

    it('no se puede terminar dos veces', async () => {
      prisma.matches.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.finishMatch('abc123', 'm1', 'u1')).rejects.toThrow(ConflictException);
      expect(stats.recordMatchResult).not.toHaveBeenCalled();
    });

    it('no se puede terminar con rondas pendientes', async () => {
      prisma.matches.findUnique.mockResolvedValue({ id: 'm1', room_id: 'room1', rounds: [{ id: 'r1', status: 'voting' }] });
      await expect(service.finishMatch('abc123', 'm1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('sólo la puede terminar alguien de la sala', async () => {
      await expect(service.finishMatch('abc123', 'm1', 'intruso')).rejects.toThrow(BadRequestException);
    });
  });
});
