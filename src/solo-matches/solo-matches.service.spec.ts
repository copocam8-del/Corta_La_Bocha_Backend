import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SoloMatchesService } from './solo-matches.service';
import { PrismaService } from '../prisma/prisma.service';
import { TuttiFruttiValidatorService } from '../tutti-frutti/tutti-frutti.service';
import { StatsService } from '../stats/stats.service';
import { AchievementsService } from '../achievements/achievements.service';
import { TEMATICAS } from './solo-quick';

describe('SoloMatchesService (partida rápida)', () => {
  let service: SoloMatchesService;

  const prisma = {
    matches: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    rounds: { create: jest.fn(), update: jest.fn() },
    answers: { create: jest.fn() },
    categories: { findMany: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const validator = { validateRound: jest.fn() };
  const stats = { recordMatchResult: jest.fn() };
  const achievements = { unlockFor: jest.fn() };

  const perfil = { matches_played: 1, matches_won: 1, total_points: 20, current_streak: 1, best_streak: 1 };

  // Partida en curso de "u1": letra O (la máquina no conoce respuestas con O → 0 puntos)
  const partida = (overrides: object = {}) => ({
    id: '11111111-1111-1111-1111-111111111111',
    user_id: 'u1',
    mode: 'vs_ai',
    tematica: 'general',
    ai_difficulty: 'experto',
    round_seconds: 60,
    status: 'in_progress',
    rounds: [{ id: 'r1', letter: 'O', started_at: new Date(Date.now() - 30_000) }],
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SoloMatchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: TuttiFruttiValidatorService, useValue: validator },
        { provide: StatsService, useValue: stats },
        { provide: AchievementsService, useValue: achievements },
      ],
    }).compile();
    service = module.get(SoloMatchesService);

    prisma.matches.updateMany.mockResolvedValue({ count: 1 });
    prisma.categories.findMany.mockResolvedValue([{ id: 'c1', name: 'Jugador' }]);
    stats.recordMatchResult.mockResolvedValue(perfil);
    achievements.unlockFor.mockResolvedValue([]);
  });

  it('al empezar guarda dueño, temática y duración, y devuelve las categorías y el plan de la máquina', async () => {
    prisma.matches.create.mockResolvedValue({ id: 'm1' });
    prisma.rounds.create.mockResolvedValue({ started_at: new Date() });

    const res = await service.startQuickMatch('u1', { tematica: 'mundial', dificultad: 'facil', tiempo: 120 });

    expect(prisma.matches.create.mock.calls[0][0].data).toMatchObject({
      user_id: 'u1', mode: 'vs_ai', tematica: 'mundial', ai_difficulty: 'facil', round_seconds: 120,
    });
    expect(res.categories).toEqual(TEMATICAS.mundial);
    expect(res.aiPlan).toHaveLength(TEMATICAS.mundial.length);
  });

  it('al terminar valida las respuestas, guarda el resultado y suma estadísticas con victoria', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida());
    validator.validateRound.mockResolvedValue({
      totalPoints: 20,
      results: [{ category: 'Jugador', isValid: true, points: 20 }],
    });

    const res = await service.finishQuickMatch('u1', partida().id, [{ category: 'Jugador', answer: ' Ortega ' }]);

    expect(validator.validateRound.mock.calls[0][0].answers[0]).toEqual({ category: 'Jugador', answer: 'Ortega' });
    expect(res).toMatchObject({ outcome: 'win', playerPoints: 20, aiPoints: 0 });
    expect(stats.recordMatchResult).toHaveBeenCalledWith('u1', { won: true, points: 20 }, prisma);
    expect(prisma.matches.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'finished' }) }),
    );
  });

  it('revisa los logros con los datos de la partida y devuelve los nuevos', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida());
    validator.validateRound.mockResolvedValue({
      totalPoints: 20,
      results: [{ category: 'Jugador', isValid: true, points: 20 }],
    });
    achievements.unlockFor.mockResolvedValue([{ id: 'primer_gol', name: 'Primer gol', description: '' }]);

    const res = await service.finishQuickMatch('u1', partida().id, [{ category: 'Jugador', answer: 'Ortega' }]);

    expect(achievements.unlockFor).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ mode: 'vs_ai', won: true, aiDifficulty: 'experto', matchesWon: 1, allAnswersValid: false }),
      prisma,
    );
    expect(res.newAchievements.map((a) => a.id)).toEqual(['primer_gol']);
  });

  it('ignora categorías que no son de la temática', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida());
    validator.validateRound.mockResolvedValue({ totalPoints: 0, results: [] });

    await service.finishQuickMatch('u1', partida().id, [{ category: 'Inventada', answer: 'x' }]);

    const enviadas = validator.validateRound.mock.calls[0][0].answers.map((a: { category: string }) => a.category);
    expect(enviadas).toEqual(TEMATICAS.general);
  });

  it('no deja terminar dos veces la misma partida', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida());
    prisma.matches.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.finishQuickMatch('u1', partida().id, [])).rejects.toThrow(ConflictException);
    expect(stats.recordMatchResult).not.toHaveBeenCalled();
  });

  it('no deja terminar la partida de otro usuario', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida({ user_id: 'otro' }));
    await expect(service.finishQuickMatch('u1', partida().id, [])).rejects.toThrow(NotFoundException);
  });

  it('si la validación falla, libera la partida para reintentar', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida());
    validator.validateRound.mockRejectedValue(new Error('caída'));

    await expect(service.finishQuickMatch('u1', partida().id, [])).rejects.toThrow('caída');
    expect(prisma.matches.updateMany).toHaveBeenLastCalledWith({
      where: { id: partida().id, status: 'validating' },
      data: { status: 'in_progress' },
    });
  });
});
