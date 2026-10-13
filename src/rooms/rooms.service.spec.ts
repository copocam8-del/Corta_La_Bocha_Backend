import { Test, TestingModule } from '@nestjs/testing';
import { RoomsService, resumenResultado } from './rooms.service';
import { ACHIEVEMENTS } from '../achievements/achievements.definitions';
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
  const stats = { recordMatchResult: jest.fn(), rateMultiplayer: jest.fn() };
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
    expect(stats.recordMatchResult).toHaveBeenCalledWith('u1', { won: true, points: 50, game: 'tutti_frutti' }, prisma);
    expect(stats.recordMatchResult).toHaveBeenCalledWith('u2', { won: false, points: 20, game: 'tutti_frutti' }, prisma);
    expect(stats.recordMatchResult).toHaveBeenCalledWith('u3', { won: false, points: 0, game: 'tutti_frutti' }, prisma); // abandonó: perdió
    expect(achievements.unlockFor).toHaveBeenCalledWith('u1', expect.objectContaining({ mode: 'multiplayer', won: true }), prisma);
    expect(res.u1.map((a) => a.id)).toEqual(['campeon_del_barrio']);
    // ELO de todos juntos (con los resultados de la partida)
    expect(stats.rateMultiplayer).toHaveBeenCalledWith(prisma, 'm1', resultados, 'tutti_frutti');
    expect(prisma.rooms.update).toHaveBeenCalledWith({ where: { id: 'room1' }, data: { status: 'waiting' } });
  });

  it('los juegos nuevos suman en las estadísticas de ese juego, mueven el ELO y revisan sus logros', async () => {
    prisma.matches.updateMany.mockResolvedValue({ count: 1 });
    stats.recordMatchResult.mockResolvedValue({ ...perfil, game_stats: { matches_played: 3, matches_won: 2, total_points: 90, current_streak: 1 } });
    const conExtra = [
      { userId: 'u1', points: 120, won: true, abandoned: false, extra: { errores: 0, dificultad: 'dificil' } },
      { userId: 'u2', points: 40, won: false, abandoned: false },
    ];
    await service.finishMatch('m2', 'room2', conExtra, true, 'ahorcado');
    expect(stats.rateMultiplayer).toHaveBeenCalledWith(prisma, 'm2', [
      { userId: 'u1', points: 120, won: true, abandoned: false },
      { userId: 'u2', points: 40, won: false, abandoned: false },
    ], 'ahorcado');
    expect(stats.recordMatchResult).toHaveBeenCalledWith('u1', { won: true, points: 120, game: 'ahorcado' }, prisma);
    expect(achievements.unlockFor).toHaveBeenCalledWith('u1', expect.objectContaining({
      game: 'ahorcado', mode: 'multiplayer', won: true, gameMatchesWon: 2, extra: { errores: 0, dificultad: 'dificil' },
    }), prisma);
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
    expect(stats.rateMultiplayer).not.toHaveBeenCalled();
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

  describe('empate en el primer puesto', () => {
    const empate = [
      { userId: 'u1', points: 50, won: false, result: 'draw' as const, abandoned: false },
      { userId: 'u2', points: 50, won: false, result: 'draw' as const, abandoned: false },
      { userId: 'u3', points: 10, won: false, result: 'loss' as const, abandoned: false },
    ];

    it('cuenta como jugada y no como ganada (la racha se corta) y queda guardado como empate', async () => {
      prisma.matches.updateMany.mockResolvedValue({ count: 1 });
      await service.finishMatch('m3', 'room3', empate, true, 'trivia');
      for (const r of empate) {
        expect(stats.recordMatchResult).toHaveBeenCalledWith(r.userId, { won: false, points: r.points, game: 'trivia' }, prisma);
        expect(achievements.unlockFor).toHaveBeenCalledWith(r.userId, expect.objectContaining({ mode: 'multiplayer', won: false }), prisma);
      }
      // ELO y ligas: won = false para los empatados (el ELO da 0,5 entre los que tienen los mismos puntos)
      expect(stats.rateMultiplayer).toHaveBeenCalledWith(
        prisma,
        'm3',
        expect.arrayContaining([expect.objectContaining({ userId: 'u1', won: false }), expect.objectContaining({ userId: 'u2', won: false })]),
        'trivia',
      );
      expect(prisma.matches.updateMany).toHaveBeenCalledWith({
        where: { id: 'm3', status: 'in_progress' },
        data: expect.objectContaining({ state: { resultado: { tipo: 'empate', empatados: ['u1', 'u2'] } } }),
      });
    });

    it('resumen guardado: ganador, empate o sin ganador', () => {
      expect(resumenResultado(resultados)).toEqual({ tipo: 'ganador', ganador: 'u1' });
      expect(resumenResultado(empate)).toEqual({ tipo: 'empate', empatados: ['u1', 'u2'] });
      expect(resumenResultado(resultados.map((r) => ({ ...r, won: false })))).toEqual({ tipo: 'sin_ganador' });
    });

    it('los logros de ganar en multijugador no se otorgan con empate', () => {
      const ids = ['campeon_del_barrio', 'ahorcado_multi', 'trivia_multi', 'sopa_multi', 'memotest_multi'];
      const multi = ACHIEVEMENTS.filter((a) => ids.includes(a.id));
      expect(multi).toHaveLength(ids.length);
      for (const a of multi) {
        const ctx = { matchesPlayed: 5, matchesWon: 1, totalPoints: 200, currentStreak: 0, mode: 'multiplayer' as const, points: 50, game: a.game };
        expect([a.id, a.isUnlocked({ ...ctx, won: false })]).toEqual([a.id, false]);
        expect([a.id, a.isUnlocked({ ...ctx, won: true })]).toEqual([a.id, true]);
      }
    });
  });
});
