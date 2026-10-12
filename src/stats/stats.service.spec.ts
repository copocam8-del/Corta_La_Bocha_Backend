import { Test, TestingModule } from '@nestjs/testing';
import { StatsService } from './stats.service';
import { PrismaService } from '../prisma/prisma.service';
import { periodStart } from './periods';

describe('StatsService', () => {
  let service: StatsService;
  const prisma = {
    profiles: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    game_stats: { upsert: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StatsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(StatsService);
    prisma.game_stats.upsert.mockResolvedValue({ id: 'g1', current_streak: 1, best_streak: 1, best_score: 15 });
  });

  it('también suma en las estadísticas del juego (por defecto Tutti Frutti)', async () => {
    prisma.profiles.upsert.mockResolvedValue({ current_streak: 0, best_streak: 0 });
    await service.recordMatchResult('u1', { won: true, points: 30 });
    expect(prisma.game_stats.upsert.mock.calls[0][0].where).toEqual({ user_id_game: { user_id: 'u1', game: 'tutti_frutti' } });
    expect(prisma.game_stats.update.mock.calls[0][0].data).toMatchObject({
      matches_played: { increment: 1 },
      matches_won: { increment: 1 },
      total_points: { increment: 30 },
      best_score: 30,
      current_streak: 2,
      best_streak: 2,
    });

    await service.recordMatchResult('u1', { won: false, points: 5, game: 'ahorcado' });
    expect(prisma.game_stats.upsert.mock.calls[1][0].where).toEqual({ user_id_game: { user_id: 'u1', game: 'ahorcado' } });
    expect(prisma.game_stats.update.mock.calls[1][0].data).toMatchObject({ current_streak: 0, best_score: 15 });
  });

  const perfil = (current_streak: number, best_streak: number) => ({ current_streak, best_streak });

  it('una victoria suma partida, victoria, puntos y alarga la racha', async () => {
    prisma.profiles.upsert.mockResolvedValue(perfil(2, 4));
    await service.recordMatchResult('u1', { won: true, points: 30 });
    expect(prisma.profiles.update).toHaveBeenCalledWith({
      where: { user_id: 'u1' },
      data: {
        matches_played: { increment: 1 },
        matches_won: { increment: 1 },
        total_points: { increment: 30 },
        current_streak: 3,
        best_streak: 4,
      },
    });
  });

  it('si la racha actual supera la mejor, actualiza la mejor', async () => {
    prisma.profiles.upsert.mockResolvedValue(perfil(4, 4));
    await service.recordMatchResult('u1', { won: true, points: 0 });
    expect(prisma.profiles.update.mock.calls[0][0].data).toMatchObject({ current_streak: 5, best_streak: 5 });
  });

  it('una derrota o empate corta la racha pero suma la partida', async () => {
    prisma.profiles.upsert.mockResolvedValue(perfil(3, 3));
    await service.recordMatchResult('u1', { won: false, points: 10 });
    expect(prisma.profiles.update.mock.calls[0][0].data).toMatchObject({
      matches_played: { increment: 1 },
      matches_won: { increment: 0 },
      current_streak: 0,
      best_streak: 3,
    });
  });

  it('nunca resta puntos', async () => {
    prisma.profiles.upsert.mockResolvedValue(perfil(0, 0));
    await service.recordMatchResult('u1', { won: false, points: -5 });
    expect(prisma.profiles.update.mock.calls[0][0].data.total_points).toEqual({ increment: 0 });
  });

  const fila = (id: string, total_points: number, elo = 1000) => ({
    total_points, matches_played: 1, matches_won: 0, best_streak: 0, avatar_id: null, elo,
    user: { id, username: id, country: null },
  });

  it('mi posición aunque no esté en el top (global)', async () => {
    prisma.profiles.findMany.mockResolvedValue([fila('a', 300), fila('b', 200), fila('u1', 100), fila('c', 50)]);
    prisma.profiles.findUnique.mockResolvedValue({ total_points: 100, elo: 1016, elo_games: 1 });
    await expect(service.getUserRanking('u1')).resolves.toMatchObject({
      period: 'global', position: 3, totalPlayers: 4, totalPoints: 100, elo: 1016,
    });
  });

  it('ranking ELO: sólo quienes jugaron partidas con ELO, ordenado por ELO', async () => {
    prisma.profiles.findMany.mockResolvedValue([fila('a', 10, 1100), fila('b', 900, 1050)]);
    const top = await service.getLeaderboard('elo');
    expect(prisma.profiles.findMany.mock.calls[0][0]).toMatchObject({ where: { elo_games: { gt: 0 } }, orderBy: [{ elo: 'desc' }, { matches_won: 'desc' }] });
    expect(top.map((t) => [t.userId, t.position, t.elo])).toEqual([['a', 1, 1100], ['b', 2, 1050]]);
  });

  it('semanal: suma sólo las partidas desde el lunes (hora argentina)', async () => {
    const results = {
      groupBy: jest
        .fn()
        .mockResolvedValueOnce([
          { user_id: 'b', _sum: { points: 40 }, _count: { _all: 2 } },
          { user_id: 'a', _sum: { points: 90 }, _count: { _all: 3 } },
        ])
        .mockResolvedValueOnce([{ user_id: 'a', _count: { _all: 2 } }]),
    };
    (prisma as unknown as { match_results: unknown }).match_results = results;
    (prisma as unknown as { users: unknown }).users = {
      findMany: jest.fn().mockResolvedValue([
        { id: 'a', username: 'Ana', country: null, profile: { avatar_id: null, best_streak: 0, elo: 1000 } },
        { id: 'b', username: 'Beto', country: null, profile: null },
      ]),
    };
    const top = await service.getLeaderboard('semanal');
    expect(top.map((t) => [t.username, t.position, t.totalPoints, t.matchesPlayed, t.matchesWon])).toEqual([
      ['Ana', 1, 90, 3, 2],
      ['Beto', 2, 40, 2, 0],
    ]);
    const since = results.groupBy.mock.calls[0][0].where.created_at.gte as Date;
    expect(since.getTime()).toBe(periodStart('semanal')!.getTime());
  });

  it('en el top, los empatados comparten posición y no se exponen datos privados', async () => {
    prisma.profiles.findMany.mockResolvedValue([fila('a', 50), fila('b', 50), fila('c', 10)]);
    const top = await service.getTopPlayers();
    expect(top.map((t) => t.position)).toEqual([1, 1, 3]);
    expect(prisma.profiles.findMany.mock.calls[0][0].select.user.select).toEqual({ id: true, username: true, country: true });
  });
});
