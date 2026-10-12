import { ConflictException, NotFoundException } from '@nestjs/common';
import { GameResultsService } from './game-results.service';
import { GAMES, GAME_IDS, isGameId } from './games';
import { ACHIEVEMENTS } from '../achievements/achievements.definitions';
import { MULTI_GAMES } from '../rooms/modes/types';
import { AchievementsService } from '../achievements/achievements.service';

describe('catálogo de juegos', () => {
  it('ids únicos, todos con nombre y pantalla; Tutti Frutti disponible y con ELO', () => {
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length);
    expect(GAMES.map((g) => g.id)).toEqual([...GAME_IDS]);
    expect(GAMES.every((g) => g.name && g.path.startsWith('/'))).toBe(true);
    expect(GAMES.find((g) => g.id === 'tutti_frutti')).toMatchObject({ available: true, hasElo: true });
    expect(isGameId('ahorcado')).toBe(true);
    expect(isGameId('truco')).toBe(false);
  });

  it('los juegos con menú "¿Cómo querés jugar?" son los que tienen multijugador (el desafío del día no)', () => {
    expect(GAMES.filter((g) => g.multiplayer).map((g) => g.id)).toEqual([...MULTI_GAMES]);
    expect(GAMES.find((g) => g.id === 'trivia_diaria')!.multiplayer).toBe(false);
  });

  it('los logros de juego apuntan a juegos que existen', () => {
    for (const a of ACHIEVEMENTS) if (a.game) expect(GAME_IDS).toContain(a.game);
  });
});

describe('logros por juego', () => {
  const tx = { user_achievements: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn() } };
  const service = new AchievementsService({} as never);
  const base = { matchesPlayed: 1, matchesWon: 1, totalPoints: 10, currentStreak: 1, won: true };

  it('un logro de Tutti Frutti no se gana jugando otro juego', async () => {
    const enAhorcado = await service.unlockFor('u1', { ...base, game: 'ahorcado', mode: 'vs_ai', aiDifficulty: 'experto' }, tx as never);
    expect(enAhorcado.map((a) => a.id)).not.toContain('le_ganaste_a_la_maquina');
    expect(enAhorcado.map((a) => a.id)).toContain('debut'); // los generales sí
    const enTutti = await service.unlockFor('u1', { ...base, mode: 'vs_ai', aiDifficulty: 'experto' }, tx as never);
    expect(enTutti.map((a) => a.id)).toContain('le_ganaste_a_la_maquina');
  });
});

describe('GameResultsService', () => {
  const prisma = {
    matches: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const gameStats = { matches_played: 3, matches_won: 2, total_points: 90, current_streak: 2, best_streak: 2 };
  const stats = {
    recordMatchResult: jest.fn().mockResolvedValue({ matches_played: 10, matches_won: 5, total_points: 300, current_streak: 2, game_stats: gameStats }),
    logResult: jest.fn(),
  };
  const achievements = { unlockFor: jest.fn().mockResolvedValue([{ id: 'x', name: 'X', description: '' }]) };
  const service = new GameResultsService(prisma as never, stats as never, achievements as never);

  beforeEach(() => jest.clearAllMocks());

  it('termina una sola vez y registra estadísticas del juego, ligas y logros con los datos extra', async () => {
    prisma.matches.updateMany.mockResolvedValueOnce({ count: 1 });
    const res = await service.finish('u1', 'm1', 'ahorcado', { points: 42.6, won: true, extra: { errores: 0 } });
    expect(stats.recordMatchResult).toHaveBeenCalledWith('u1', { won: true, points: 43, game: 'ahorcado' }, prisma);
    expect(stats.logResult).toHaveBeenCalledWith(prisma, 'm1', { userId: 'u1', game: 'ahorcado', points: 43, won: true, abandoned: false });
    expect(achievements.unlockFor).toHaveBeenCalledWith('u1', expect.objectContaining({
      game: 'ahorcado', mode: 'solo', points: 43, gameMatchesPlayed: 3, gameMatchesWon: 2, extra: { errores: 0 },
    }), prisma);
    expect(res).toMatchObject({ newAchievements: [{ id: 'x' }], gameStats: { matchesPlayed: 3, totalPoints: 90 } });

    prisma.matches.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.finish('u1', 'm1', 'ahorcado', { points: 10, won: true })).toBeNull();
    expect(stats.recordMatchResult).toHaveBeenCalledTimes(1);
  });

  it('sólo se carga la partida propia, del juego correcto y en curso', async () => {
    prisma.matches.findUnique.mockResolvedValue({ id: 'm1', user_id: 'otro', game: 'ahorcado', status: 'in_progress' });
    await expect(service.loadActive('u1', 'm1', 'ahorcado')).rejects.toThrow(NotFoundException);
    prisma.matches.findUnique.mockResolvedValue({ id: 'm1', user_id: 'u1', game: 'trivia', status: 'in_progress' });
    await expect(service.loadActive('u1', 'm1', 'ahorcado')).rejects.toThrow(NotFoundException);
    prisma.matches.findUnique.mockResolvedValue({ id: 'm1', user_id: 'u1', game: 'ahorcado', status: 'finished' });
    await expect(service.loadActive('u1', 'm1', 'ahorcado')).rejects.toThrow(ConflictException);
  });

  it('las partidas abandonadas cuentan como perdidas con 0 puntos', async () => {
    prisma.matches.findMany.mockResolvedValue([{ id: 'vieja' }]);
    prisma.matches.updateMany.mockResolvedValue({ count: 1 });
    expect(await service.closeAbandoned('u1', 'trivia', 60_000)).toBe(1);
    expect(stats.recordMatchResult).toHaveBeenCalledWith('u1', { won: false, points: 0, game: 'trivia' }, prisma);
    expect(stats.logResult).toHaveBeenCalledWith(prisma, 'vieja', expect.objectContaining({ abandoned: true }));
  });
});
