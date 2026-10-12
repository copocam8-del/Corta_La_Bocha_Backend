import { BadRequestException } from '@nestjs/common';
import { CATEGORIAS_TRIVIA, PREGUNTAS } from './trivia-bank';
import { ACIERTOS_PARA_GANAR, elegirPreguntas, GRACIA_MS, mezclar, prepararPregunta, puntosRespuesta, SEGUNDOS_POR_PREGUNTA } from './trivia-rules';
import { TriviaService } from './trivia.service';
import { seededRandom } from '../solo-matches/solo-quick';
import { ACHIEVEMENTS } from '../achievements/achievements.definitions';

describe('banco de preguntas', () => {
  it('tiene al menos 150 preguntas, ids únicos, 4 opciones distintas y textos terminados en "?"', () => {
    expect(PREGUNTAS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(PREGUNTAS.map((p) => p.id)).size).toBe(PREGUNTAS.length);
    expect(new Set(PREGUNTAS.map((p) => p.texto)).size).toBe(PREGUNTAS.length);
    for (const p of PREGUNTAS) {
      const opciones = [p.correcta, ...p.incorrectas].map((o) => o.toLowerCase().trim());
      expect({ id: p.id, distintas: new Set(opciones).size }).toEqual({ id: p.id, distintas: 4 });
      expect(p.texto.endsWith('?')).toBe(true);
    }
  });

  it('todas las categorías tienen preguntas y hay de las tres dificultades', () => {
    for (const c of CATEGORIAS_TRIVIA) expect(PREGUNTAS.filter((p) => p.categoria === c).length).toBeGreaterThanOrEqual(15);
    for (const d of ['facil', 'medio', 'dificil'] as const) expect(PREGUNTAS.filter((p) => p.dificultad === d).length).toBeGreaterThanOrEqual(25);
  });

  it('no hay preguntas que cambian con cada Mundial (títulos totales, máximos goleadores)', () => {
    const prohibidas = PREGUNTAS.filter((p) => /cu[aá]ntos mundiales|m[aá]ximo goleador de (la historia de )?los mundiales|m[aá]s mundiales/i.test(p.texto));
    expect(prohibidas.map((p) => p.texto)).toEqual([]);
  });
});

describe('reglas', () => {
  it('puntos: base por dificultad + rapidez; incorrecta o fuera de tiempo = 0', () => {
    const limite = SEGUNDOS_POR_PREGUNTA * 1000;
    expect(puntosRespuesta('facil', true, 0)).toBe(20);
    expect(puntosRespuesta('dificil', true, limite / 2)).toBe(25);
    expect(puntosRespuesta('medio', true, limite)).toBe(15);
    expect(puntosRespuesta('medio', true, limite + GRACIA_MS + 1)).toBe(0);
    expect(puntosRespuesta('dificil', false, 0)).toBe(0);
  });

  it('mezclar con semilla da siempre lo mismo y no pierde elementos', () => {
    const a = mezclar([1, 2, 3, 4, 5], seededRandom('x'));
    expect(a).toEqual(mezclar([1, 2, 3, 4, 5], seededRandom('x')));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('al preparar una pregunta, el índice correcto apunta a la respuesta correcta', () => {
    for (const p of PREGUNTAS.slice(0, 30)) {
      const pj = prepararPregunta(p, Math.random);
      expect(pj.opciones[pj.correcta]).toBe(p.correcta);
    }
  });

  it('filtra por categoría y dificultad', () => {
    const elegidas = elegirPreguntas(Math.random, { categoria: 'Reglamento' });
    expect(elegidas.every((p) => p.categoria === 'Reglamento')).toBe(true);
    expect(elegidas).toHaveLength(10);
  });
});

describe('TriviaService', () => {
  let state: Record<string, unknown> | null = null;
  const results = {
    closeAbandoned: jest.fn(),
    createMatch: jest.fn(async (_u: string, _g: string, s: Record<string, unknown>) => { state = s; return { id: 'm1' }; }),
    loadActive: jest.fn(async () => ({ state })),
    saveState: jest.fn(async (_id: string, s: Record<string, unknown>) => { state = s; }),
    finish: jest.fn(async () => ({ newAchievements: [], gameStats: {} })),
  };
  const service = new TriviaService(results as never);
  const correctas = () => (state as unknown as { preguntas: { correcta: number }[] }).preguntas.map((p) => p.correcta);

  beforeEach(() => { jest.clearAllMocks(); state = null; });
  afterEach(() => jest.useRealTimers());

  it('nunca manda cuál es la opción correcta antes de responder', async () => {
    const r = await service.empezar('u1', {});
    expect(r.total).toBe(10);
    expect(r.pregunta.opciones).toHaveLength(4);
    expect(JSON.stringify(r)).not.toMatch(/correcta/);
  });

  it('corrige cada respuesta, avanza y al final registra el resultado una sola vez', async () => {
    await service.empezar('u1', {});
    const ok = correctas();
    let res: Record<string, unknown> = {};
    for (let i = 0; i < 10; i++) res = await service.responder('u1', 'm1', i < 7 ? ok[i] : (ok[i] + 1) % 4);
    expect(res).toMatchObject({ terminada: true, gano: true, aciertos: 7, total: 10 });
    expect(results.finish).toHaveBeenCalledTimes(1);
    expect(results.finish).toHaveBeenCalledWith('u1', 'm1', 'trivia',
      expect.objectContaining({ won: true, extra: expect.objectContaining({ aciertos: 7, total: 10 }) }), expect.anything());
  });

  it(`con menos de ${ACIERTOS_PARA_GANAR} aciertos no se aprueba`, async () => {
    await service.empezar('u1', {});
    const ok = correctas();
    let res: Record<string, unknown> = {};
    for (let i = 0; i < 10; i++) res = await service.responder('u1', 'm1', i < 5 ? ok[i] : null);
    expect(res).toMatchObject({ terminada: true, gano: false, aciertos: 5 });
  });

  it('una respuesta que llega tarde no vale aunque sea la correcta', async () => {
    jest.useFakeTimers();
    await service.empezar('u1', {});
    jest.setSystemTime(Date.now() + SEGUNDOS_POR_PREGUNTA * 1000 + GRACIA_MS + 500);
    const r = await service.responder('u1', 'm1', correctas()[0]);
    expect(r).toMatchObject({ correcta: false, aTiempo: false, puntosPregunta: 0 });
  });

  it('opción fuera de rango → 400', async () => {
    await service.empezar('u1', {});
    await expect(service.responder('u1', 'm1', 7)).rejects.toThrow(BadRequestException);
  });

  it('logros de la trivia', () => {
    const logro = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;
    const base = { matchesPlayed: 1, matchesWon: 1, totalPoints: 0, currentStreak: 1, mode: 'solo' as const, game: 'trivia' as const, won: true };
    expect(logro('trivia_perfecta').isUnlocked({ ...base, extra: { aciertos: 10, total: 10 } })).toBe(true);
    expect(logro('trivia_perfecta').isUnlocked({ ...base, extra: { aciertos: 9, total: 10 } })).toBe(false);
    expect(logro('trivia_rapida').isUnlocked({ ...base, extra: { aciertos: 8, promedioSegundos: 4.2 } })).toBe(true);
    expect(logro('trivia_rapida').isUnlocked({ ...base, extra: { aciertos: 8, promedioSegundos: 7 } })).toBe(false);
    expect(logro('trivia_diez').isUnlocked({ ...base, gameMatchesWon: 10 })).toBe(true);
  });
});
