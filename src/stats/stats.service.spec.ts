import { Test, TestingModule } from '@nestjs/testing';
import { StatsService } from './stats.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StatsService', () => {
  let service: StatsService;
  const prisma = {
    profiles: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StatsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(StatsService);
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

  it('la posición en el ranking es la cantidad de jugadores con más puntos + 1', async () => {
    prisma.profiles.findUnique.mockResolvedValue({ total_points: 100 });
    prisma.profiles.count.mockResolvedValueOnce(4).mockResolvedValueOnce(20);
    await expect(service.getUserRanking('u1')).resolves.toEqual({ position: 5, totalPlayers: 20, totalPoints: 100 });
    expect(prisma.profiles.count).toHaveBeenNthCalledWith(1, { where: { total_points: { gt: 100 } } });
  });

  it('en el top, los empatados comparten posición y no se exponen datos privados', async () => {
    const fila = (id: string, total_points: number) => ({
      total_points, matches_played: 1, matches_won: 0, best_streak: 0, avatar_id: null,
      user: { id, username: id, country: null },
    });
    prisma.profiles.findMany.mockResolvedValue([fila('a', 50), fila('b', 50), fila('c', 10)]);
    const top = await service.getTopPlayers();
    expect(top.map((t) => t.position)).toEqual([1, 1, 3]);
    expect(prisma.profiles.findMany.mock.calls[0][0].select.user.select).toEqual({ id: true, username: true, country: true });
  });
});
