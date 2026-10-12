import { BadRequestException } from '@nestjs/common';
import { armarMazo, GRACIA_MS, NIVELES_MEMOTEST, puntosMemotest, TEMAS_MEMOTEST, type NivelMemotest, type TemaMemotest } from './memotest-rules';
import { MemotestService } from './memotest.service';
import { seededRandom } from '../solo-matches/solo-quick';
import { ACHIEVEMENTS } from '../achievements/achievements.definitions';

describe('pares del memotest', () => {
  it('cada tema alcanza para el nivel difícil y no repite textos', () => {
    for (const t of Object.values(TEMAS_MEMOTEST)) {
      expect(t.pares.length).toBeGreaterThanOrEqual(NIVELES_MEMOTEST.dificil.pares);
      const izq = t.pares.map(([a]) => a);
      const der = t.pares.map(([, b]) => b);
      expect(new Set(izq).size).toBe(izq.length);
      expect(new Set(der).size).toBe(der.length);
    }
  });

  it.each(Object.keys(TEMAS_MEMOTEST).flatMap((t) => (['facil', 'medio', 'dificil'] as NivelMemotest[]).map((n) => [t, n])))(
    '%s / %s: 2 cartas por par, mezcladas',
    (t, n) => {
      const mazo = armarMazo(t as TemaMemotest, n as NivelMemotest, seededRandom(`${t}${n}`));
      const pares = NIVELES_MEMOTEST[n as NivelMemotest].pares;
      expect(mazo).toHaveLength(pares * 2);
      for (let p = 0; p < pares; p++) expect(mazo.filter((c) => c.par === p)).toHaveLength(2);
    },
  );

  it('puntos: base + eficiencia + rapidez al completar; 5 por par si no completa', () => {
    expect(puntosMemotest('facil', true, 6, 6, 0)).toBe(60 + 30 + 40);
    expect(puntosMemotest('facil', true, 6, 20, 300)).toBe(60);
    expect(puntosMemotest('dificil', false, 4, 30, 240)).toBe(20);
  });
});

describe('MemotestService', () => {
  let state: Record<string, unknown> | null = null;
  const results = {
    closeAbandoned: jest.fn(),
    createMatch: jest.fn(async (_u: string, _g: string, s: Record<string, unknown>) => { state = s; return { id: 'm1' }; }),
    loadActive: jest.fn(async () => ({ state })),
    saveState: jest.fn(async (_id: string, s: Record<string, unknown>) => { state = s; }),
    finish: jest.fn(async () => ({ newAchievements: [], gameStats: {} })),
  };
  const service = new MemotestService(results as never);
  const mazo = () => (state as unknown as { mazo: { par: number }[] }).mazo;

  beforeEach(() => { jest.clearAllMocks(); state = null; });

  it('al empezar no manda el contenido de las cartas', async () => {
    const v = await service.empezar('u1', 'clubes_apodos', 'facil', seededRandom('a'));
    expect(v).toMatchObject({ cartas: 12, pares: 6, descubiertas: [] });
    expect(JSON.stringify(v)).not.toMatch(/Xeneize|Millonario|Boca/);
  });

  it('revela cada carta al darla vuelta, decide si es par y al completar termina', async () => {
    const t0 = Date.now();
    await service.empezar('u1', 'jugadores_selecciones', 'facil', seededRandom('b'));
    const m = mazo();
    // Un intento fallido
    const otra = m.findIndex((c) => c.par !== m[0].par);
    expect(await service.voltear('u1', 'm1', 0, t0 + 100)).toMatchObject({ carta: { indice: 0 } });
    expect(await service.voltear('u1', 'm1', otra, t0 + 200)).toMatchObject({ par: false, movimientos: 1 });
    // Todos los pares
    let r: Record<string, unknown> = {};
    for (let p = 0; p < 6; p++) {
      const [i, j] = m.map((c, idx) => (c.par === p ? idx : -1)).filter((x) => x >= 0);
      await service.voltear('u1', 'm1', i, t0 + 300);
      r = await service.voltear('u1', 'm1', j, t0 + 400);
    }
    expect(r).toMatchObject({ terminada: true, gano: true, movimientos: 7, par: true });
    expect(results.finish).toHaveBeenCalledWith('u1', 'm1', 'memotest',
      expect.objectContaining({ won: true, extra: expect.objectContaining({ movimientos: 7, pares: 6 }) }), expect.anything());
  });

  it('no deja voltear una carta ya descubierta ni la misma dos veces', async () => {
    await service.empezar('u1', 'estadios_clubes', 'facil', seededRandom('c'));
    await service.voltear('u1', 'm1', 0);
    await expect(service.voltear('u1', 'm1', 0)).rejects.toThrow(BadRequestException);
    await expect(service.voltear('u1', 'm1', 99)).rejects.toThrow(BadRequestException);
  });

  it('si se acabó el tiempo, termina con los pares encontrados', async () => {
    const t0 = Date.now();
    await service.empezar('u1', 'clubes_apodos', 'facil', seededRandom('d'));
    const r = await service.voltear('u1', 'm1', 0, t0 + NIVELES_MEMOTEST.facil.segundos * 1000 + GRACIA_MS + 10);
    expect(r).toMatchObject({ terminada: true, gano: false, puntos: 0 });
  });

  it('logros del memotest', () => {
    const logro = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;
    const base = { matchesPlayed: 1, matchesWon: 1, totalPoints: 0, currentStreak: 1, mode: 'solo' as const, game: 'memotest' as const, won: true };
    expect(logro('memotest_elefante').isUnlocked({ ...base, extra: { movimientos: 8, pares: 6 } })).toBe(true);
    expect(logro('memotest_elefante').isUnlocked({ ...base, extra: { movimientos: 9, pares: 6 } })).toBe(false);
    expect(logro('memotest_dificil').isUnlocked({ ...base, extra: { nivel: 'dificil' } })).toBe(true);
    expect(logro('memotest_diez').isUnlocked({ ...base, gameMatchesWon: 10 })).toBe(true);
  });
});
