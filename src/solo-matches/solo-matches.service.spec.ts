import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { SoloMatchesService } from './solo-matches.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnswerCheck, AnswerToCheck, TuttiFruttiValidatorService } from '../tutti-frutti/tutti-frutti.service';
import { StatsService } from '../stats/stats.service';
import { AchievementsService } from '../achievements/achievements.service';
import { buildAiPlan, GRACIA_MS, letrasDe, TEMATICAS } from './solo-quick';

// Validador falso: vacía → empty; si está en "validas" → valid con ese nombre canónico; si no → invalid.
// Con "caida = true" deja todo sin validar, como si OpenAI no respondiera.
function validadorFalso(validas: Record<string, string>, caida = false) {
  return jest.fn((_letter: string, items: AnswerToCheck[]) => {
    const map = new Map<string, AnswerCheck>();
    for (const i of items) {
      if (!i.answer) map.set(i.key, { status: 'empty', canonical: null, reason: 'No respondiste.' });
      else if (caida) map.set(i.key, { status: 'unverified', canonical: null, reason: 'No se pudo validar.' });
      else if (validas[i.answer]) map.set(i.key, { status: 'valid', canonical: validas[i.answer], reason: 'Válida.' });
      else map.set(i.key, { status: 'invalid', canonical: null, reason: 'No existe.' });
    }
    return Promise.resolve(map);
  });
}

describe('SoloMatchesService (partida rápida)', () => {
  let service: SoloMatchesService;

  const prisma = {
    matches: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    rounds: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    answers: { create: jest.fn() },
    categories: { findMany: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const validator = { validateAnswers: validadorFalso({}) };
  const stats = { recordMatchResult: jest.fn() };
  const achievements = { unlockFor: jest.fn() };

  const perfil = { matches_played: 1, matches_won: 1, total_points: 20, current_streak: 1, best_streak: 1 };
  const ID = '11111111-1111-1111-1111-111111111111';

  // Partida en curso de "u1" con letra O. Por defecto empezó recién: la máquina todavía no escribió nada.
  const partida = (overrides: object = {}, segundosJugados = 0) => ({
    id: ID,
    user_id: 'u1',
    mode: 'vs_ai',
    tematica: 'general',
    ai_difficulty: 'experto',
    round_seconds: 60,
    status: 'in_progress',
    rounds: [{ id: 'r1', letter: 'O', started_at: new Date(Date.now() - segundosJugados * 1000) }],
    ...overrides,
  });

  // Para cantar ¡Basta! hay que completar todo: las demás categorías van con respuestas que no valen
  const conRelleno = (respuestas: Record<string, string>, tematica = 'general') =>
    TEMATICAS[tematica].map((c) => ({ category: c, answer: respuestas[c] ?? `Oxx ${c}` }));

  beforeEach(async () => {
    jest.clearAllMocks();
    validator.validateAnswers = validadorFalso({ Ortega: 'Ariel Ortega' });
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
    prisma.matches.findMany.mockResolvedValue([]);
    prisma.categories.findMany.mockResolvedValue([{ id: 'c1', name: 'Jugador Argentino' }]);
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
    // La letra sale de las que tienen sentido para la temática y la hora la pone el servidor
    expect(letrasDe('mundial')).toContain(res.letter);
    expect(prisma.rounds.create.mock.calls[0][0].data.started_at).toBeInstanceOf(Date);
  });

  it('en "Mundial" nunca sale una letra sin país sede ni selección campeona posibles', async () => {
    prisma.matches.create.mockResolvedValue({ id: 'm1' });
    prisma.rounds.create.mockResolvedValue({ started_at: new Date() });
    for (let i = 0; i < 60; i++) {
      const res = await service.startQuickMatch('u1', { tematica: 'mundial', dificultad: 'facil', tiempo: 60 });
      expect(['L', 'N', 'O', 'P', 'T', 'V', 'D']).not.toContain(res.letter);
    }
  });

  it('valida jugador y máquina en una sola llamada y puntúa con la regla clásica', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida());

    const res = await service.finishQuickMatch('u1', ID, conRelleno({ 'Jugador Argentino': ' Ortega ' }));

    expect(validator.validateAnswers).toHaveBeenCalledTimes(1);
    const [letra, items] = validator.validateAnswers.mock.calls[0];
    expect(letra).toBe('O');
    expect(items).toContainEqual({ key: 'jugador:Jugador Argentino', category: 'Jugador Argentino', answer: 'Ortega' });
    expect(items.filter((i) => i.key.startsWith('maquina:'))).toHaveLength(TEMATICAS.general.length);

    // La máquina todavía no había escrito nada: el jugador es el único con respuesta válida → 20
    expect(res).toMatchObject({ outcome: 'win', playerPoints: 20, aiPoints: 0, validationIncomplete: false });
    expect(res.results.find((r) => r.category === 'Jugador Argentino')).toMatchObject({
      userAnswer: 'Ortega', status: 'valid', isValid: true, canonical: 'Ariel Ortega', reason: 'Válida.', points: 20,
    });
    expect(stats.recordMatchResult).toHaveBeenCalledWith('u1', { won: true, points: 20 }, prisma);
  });

  it('las respuestas de la máquina pasan por la misma validación y suman como un jugador más', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida({}, 100)); // pasó todo el tiempo
    const plan = buildAiPlan(ID, 'O', TEMATICAS.general, 'experto');
    const escritas = plan.filter((p) => p.answer);
    expect(escritas.length).toBeGreaterThan(0);
    validator.validateAnswers = validadorFalso(Object.fromEntries(escritas.map((p) => [p.answer!, p.answer!])));

    const res = await service.finishQuickMatch('u1', ID, []);

    const items = validator.validateAnswers.mock.calls[0][1];
    for (const p of escritas) expect(items).toContainEqual({ key: `maquina:${p.category}`, category: p.category, answer: p.answer });
    // El jugador no respondió nada: cada respuesta válida de la máquina es la única → 20 cada una
    expect(res.aiPoints).toBe(escritas.length * 20);
    expect(res.playerPoints).toBe(0);
    expect(res.outcome).toBe('loss');
    for (const p of escritas) {
      expect(res.results.find((r) => r.category === p.category)?.machine).toMatchObject({ answer: p.answer, status: 'valid', points: 20 });
    }
  });

  it('si el jugador y la máquina ponen lo mismo, 5 cada uno', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida({}, 100));
    const plan = buildAiPlan(ID, 'O', TEMATICAS.general, 'experto');
    const item = plan.find((p) => p.answer)!;
    validator.validateAnswers = validadorFalso({ [item.answer!]: item.answer! });

    const res = await service.finishQuickMatch('u1', ID, [{ category: item.category, answer: item.answer! }]);

    const fila = res.results.find((r) => r.category === item.category)!;
    expect(fila.points).toBe(5);
    expect(fila.machine.points).toBe(5);
  });

  it('si la IA no respondió: avisa, deja 0 puntos y la partida NO cuenta para estadísticas ni logros', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida());
    validator.validateAnswers = validadorFalso({}, true);

    const res = await service.finishQuickMatch('u1', ID, conRelleno({ 'Jugador Argentino': 'Ortega' }));

    expect(res).toMatchObject({ validationIncomplete: true, playerPoints: 0, stats: null, newAchievements: [] });
    expect(stats.recordMatchResult).not.toHaveBeenCalled();
    expect(achievements.unlockFor).not.toHaveBeenCalled();
    expect(prisma.answers.create.mock.calls[0][0].data).toMatchObject({ is_valid: null, validated_by: 'unverified' });
    expect(prisma.matches.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'finished' }) }),
    );
  });

  it('revisa los logros con los datos de la partida y devuelve los nuevos', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida());
    achievements.unlockFor.mockResolvedValue([{ id: 'primer_gol', name: 'Primer gol', description: '' }]);

    const res = await service.finishQuickMatch('u1', ID, conRelleno({ 'Jugador Argentino': 'Ortega' }));

    expect(achievements.unlockFor).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ mode: 'vs_ai', won: true, aiDifficulty: 'experto', matchesWon: 1, allAnswersValid: false }),
      prisma,
    );
    expect(res.newAchievements.map((a) => a.id)).toEqual(['primer_gol']);
  });

  it('ignora categorías que no son de la temática', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida({}, 60)); // se terminó el tiempo

    await service.finishQuickMatch('u1', ID, [{ category: 'Inventada', answer: 'Ortega' }]);

    const jugador = validator.validateAnswers.mock.calls[0][1].filter((i) => i.key.startsWith('jugador:'));
    expect(jugador.map((i) => i.category)).toEqual(TEMATICAS.general);
    expect(jugador.every((i) => i.answer === null)).toBe(true);
  });

  it('no deja terminar dos veces la misma partida', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida({}, 60));
    prisma.matches.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.finishQuickMatch('u1', ID, [])).rejects.toThrow(ConflictException);
    expect(stats.recordMatchResult).not.toHaveBeenCalled();
  });

  it('una partida ya terminada responde 409 sin tocar nada', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida({ status: 'finished' }, 60));
    await expect(service.finishQuickMatch('u1', ID, [])).rejects.toThrow(ConflictException);
    expect(prisma.matches.updateMany).not.toHaveBeenCalled();
  });

  it('¡Basta! antes de tiempo sólo con todas las categorías completas (si no, 400 y la partida sigue)', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida({}, 10));

    await expect(
      service.finishQuickMatch('u1', ID, [{ category: 'Jugador Argentino', answer: 'Ortega' }]),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.matches.updateMany).not.toHaveBeenCalled();
    expect(validator.validateAnswers).not.toHaveBeenCalled();

    // Con todo completo, sí
    await expect(service.finishQuickMatch('u1', ID, conRelleno({ 'Jugador Argentino': 'Ortega' }))).resolves.toBeDefined();
  });

  it('cuando se termina el tiempo vale aunque falten categorías', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida({}, 60));
    await expect(
      service.finishQuickMatch('u1', ID, [{ category: 'Jugador Argentino', answer: 'Ortega' }]),
    ).resolves.toBeDefined();
  });

  it('si las respuestas llegan mucho después del final, la partida cuenta como abandonada (perdida)', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida({}, 60 + GRACIA_MS / 1000 + 5));

    await expect(service.finishQuickMatch('u1', ID, conRelleno({}))).rejects.toThrow(GoneException);
    expect(validator.validateAnswers).not.toHaveBeenCalled();
    expect(prisma.matches.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: 'in_progress' },
      data: expect.objectContaining({ status: 'abandoned' }),
    });
    expect(stats.recordMatchResult).toHaveBeenCalledWith('u1', { won: false, points: 0 }, prisma);
  });

  describe('partidas abandonadas', () => {
    const abierta = (segundosAtras: number, id = 'vieja') => ({
      id,
      round_seconds: 60,
      created_at: new Date(Date.now() - segundosAtras * 1000),
      rounds: [{ started_at: new Date(Date.now() - segundosAtras * 1000) }],
    });

    it('al empezar otra, las vencidas recientes cuentan como perdidas (una sola vez)', async () => {
      prisma.matches.findMany.mockResolvedValue([abierta(600)]);
      await service.closeAbandonedMatches('u1');
      expect(stats.recordMatchResult).toHaveBeenCalledTimes(1);
      expect(stats.recordMatchResult).toHaveBeenCalledWith('u1', { won: false, points: 0 }, prisma);

      // Si justo se estaba terminando (ya no está "en juego"), no se cuenta
      stats.recordMatchResult.mockClear();
      prisma.matches.updateMany.mockResolvedValue({ count: 0 });
      await service.closeAbandonedMatches('u1');
      expect(stats.recordMatchResult).not.toHaveBeenCalled();
    });

    it('las que todavía están en tiempo no se tocan', async () => {
      prisma.matches.findMany.mockResolvedValue([abierta(30)]);
      await service.closeAbandonedMatches('u1');
      expect(prisma.matches.updateMany).not.toHaveBeenCalled();
    });

    it('las muy viejas se cierran sin tocar estadísticas', async () => {
      prisma.matches.findMany.mockResolvedValue([abierta(3 * 24 * 3600)]);
      await service.closeAbandonedMatches('u1');
      expect(prisma.matches.updateMany).toHaveBeenCalled();
      expect(stats.recordMatchResult).not.toHaveBeenCalled();
    });

    it('startQuickMatch cierra las abandonadas antes de crear la nueva', async () => {
      prisma.matches.findMany.mockResolvedValue([abierta(600)]);
      prisma.matches.create.mockResolvedValue({ id: 'm2' });
      prisma.rounds.create.mockResolvedValue({ started_at: new Date() });
      await service.startQuickMatch('u1', { tematica: 'general', dificultad: 'medio', tiempo: 60 });
      expect(stats.recordMatchResult).toHaveBeenCalledTimes(1);
    });
  });

  it('no deja terminar la partida de otro usuario', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida({ user_id: 'otro' }));
    await expect(service.finishQuickMatch('u1', ID, [])).rejects.toThrow(NotFoundException);
  });

  it('si algo falla al terminar, libera la partida para reintentar', async () => {
    prisma.matches.findUnique.mockResolvedValue(partida({}, 60));
    validator.validateAnswers = jest.fn().mockRejectedValue(new Error('caída'));

    await expect(service.finishQuickMatch('u1', ID, [])).rejects.toThrow('caída');
    expect(prisma.matches.updateMany).toHaveBeenLastCalledWith({
      where: { id: ID, status: 'validating' },
      data: { status: 'in_progress' },
    });
  });
});
