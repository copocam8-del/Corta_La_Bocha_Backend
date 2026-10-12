import { Test, TestingModule } from '@nestjs/testing';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { AchievementsService } from '../achievements/achievements.service';

describe('RoomsService (base del multijugador)', () => {
  let service: RoomsService;

  const prisma = {
    rooms: { update: jest.fn() },
    rounds: { update: jest.fn() },
    matches: { updateMany: jest.fn() },
    answers: { create: jest.fn((x: unknown) => x) },
    categories: { findMany: jest.fn() },
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

  const resultados = [
    { userId: 'u1', points: 50, won: true, abandoned: false },
    { userId: 'u2', points: 20, won: false, abandoned: false },
    { userId: 'u3', points: 0, won: false, abandoned: true },
  ];

  it('termina la partida una sola vez: suma partidas, victorias, puntos y logros de cada uno', async () => {
    prisma.matches.updateMany.mockResolvedValue({ count: 1 });
    achievements.unlockFor.mockImplementation(async (userId: string) =>
      userId === 'u1' ? [{ id: 'campeon_del_barrio', name: 'Campeón del barrio', description: '' }] : [],
    );

    const res = await service.finishMatch('m1', 'room1', resultados, true);

    expect(prisma.matches.updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', status: 'in_progress' },
      data: expect.objectContaining({ status: 'finished' }),
    });
    expect(stats.recordMatchResult).toHaveBeenCalledWith('u1', { won: true, points: 50 }, prisma);
    expect(stats.recordMatchResult).toHaveBeenCalledWith('u2', { won: false, points: 20 }, prisma);
    expect(stats.recordMatchResult).toHaveBeenCalledWith('u3', { won: false, points: 0 }, prisma); // abandonó: perdió
    expect(achievements.unlockFor).toHaveBeenCalledWith('u1', expect.objectContaining({ mode: 'multiplayer', won: true }), prisma);
    expect(res.u1.map((a) => a.id)).toEqual(['campeon_del_barrio']);
    expect(prisma.rooms.update).toHaveBeenCalledWith({ where: { id: 'room1' }, data: { status: 'waiting' } });
  });

  it('si ya estaba terminada, no suma nada', async () => {
    prisma.matches.updateMany.mockResolvedValue({ count: 0 });
    await service.finishMatch('m1', 'room1', resultados, true);
    expect(stats.recordMatchResult).not.toHaveBeenCalled();
  });

  it('si la IA no validó alguna respuesta, se cierra pero no cuenta para estadísticas', async () => {
    prisma.matches.updateMany.mockResolvedValue({ count: 1 });
    await service.finishMatch('m1', 'room1', resultados, false);
    expect(prisma.matches.updateMany).toHaveBeenCalled();
    expect(stats.recordMatchResult).not.toHaveBeenCalled();
    expect(achievements.unlockFor).not.toHaveBeenCalled();
  });

  it('guarda las respuestas de la ronda con su estado y puntos', async () => {
    prisma.categories.findMany.mockResolvedValue([{ id: 'c1', name: 'Jugador' }]);
    await service.saveRound('r1', [
      { roomPlayerId: 'rp1', category: 'Jugador', answer: 'Messi', status: 'valid', points: 10 },
      { roomPlayerId: 'rp2', category: 'Jugador', answer: 'Mxx', status: 'unverified', points: 0 },
      { roomPlayerId: 'rp1', category: 'No sembrada', answer: 'x', status: 'invalid', points: 0 },
    ]);
    expect(prisma.answers.create).toHaveBeenCalledTimes(2);
    expect(prisma.answers.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ room_player_id: 'rp1', is_valid: true, points: 10, validated_by: 'ai' }),
    });
    expect(prisma.answers.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ room_player_id: 'rp2', is_valid: null, validated_by: 'unverified' }),
    });
    expect(prisma.rounds.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: expect.objectContaining({ status: 'finished' }) });
  });
});
