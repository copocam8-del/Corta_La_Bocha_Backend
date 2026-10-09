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

    it('puntúa con la regla clásica (20 única válida, 10 distinta, 5 repetida, 0 rechazada por votos)', async () => {
      prisma.rounds.updateMany.mockResolvedValue({ count: 1 });
      const voto = (approve: boolean) => ({ approve });
      prisma.answers.findMany.mockResolvedValue([
        // Jugador: dos ponen "Messi" (5 c/u), uno "Mbappé" (10)
        { id: 'a1', room_player_id: 'rp1', category_id: 'jug', answer_text: 'Messi', votes: [voto(true)] },
        { id: 'a2', room_player_id: 'rp2', category_id: 'jug', answer_text: 'messi ', votes: [] },
        { id: 'a3', room_player_id: 'rp3', category_id: 'jug', answer_text: 'Mbappé', votes: [voto(true)] },
        // Equipo: sólo una válida (20); la otra rechazada por votos (0) y una vacía (0)
        { id: 'b1', room_player_id: 'rp1', category_id: 'eq', answer_text: 'Milan', votes: [] },
        { id: 'b2', room_player_id: 'rp2', category_id: 'eq', answer_text: 'Mesa', votes: [voto(false), voto(false)] },
        { id: 'b3', room_player_id: 'rp3', category_id: 'eq', answer_text: '', votes: [] },
      ]);
      prisma.answers.update.mockImplementation(({ where, data }: { where: { id: string }; data: object }) =>
        Promise.resolve({ id: where.id, room_player_id: `rp${where.id[1]}`, ...data }),
      );
      prisma.room_players.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, user_id: `u${where.id.slice(2)}` }),
      );

      const res = await service.tallyRoundVotes('m1', 'r1', 'u1');

      const puntos = Object.fromEntries(res.answers.map((a: { id: string; points: number }) => [a.id, a.points]));
      expect(puntos).toEqual({ a1: 5, a2: 5, a3: 10, b1: 20, b2: 0, b3: 0 });
      expect(res.pointsByRoomPlayer).toEqual({ rp1: 25, rp2: 5, rp3: 10 });
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
