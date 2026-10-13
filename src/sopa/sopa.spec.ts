import { BadRequestException } from '@nestjs/common';
import { buscarPalabra, celdasDe, celdasDeLinea, CONFIG_SOPA, generarSopa, GRACIA_MS, puntosSopa, TEMATICAS_SOPA, type DificultadSopa, type TematicaSopa } from './sopa-rules';
import { SopaService } from './sopa.service';
import { seededRandom } from '../solo-matches/solo-quick';

describe('banco de la sopa', () => {
  it('palabras sólo con A-Z, sin repetir y que entran en la grilla fácil', () => {
    for (const t of Object.values(TEMATICAS_SOPA)) {
      expect(new Set(t.palabras).size).toBe(t.palabras.length);
      for (const p of t.palabras) expect(p).toMatch(/^[A-Z]{4,14}$/);
      expect(t.palabras.filter((p) => p.length <= 10).length).toBeGreaterThanOrEqual(CONFIG_SOPA.facil.palabras);
    }
  });
});

describe('generador', () => {
  const casos: [TematicaSopa, DificultadSopa][] = [];
  for (const t of Object.keys(TEMATICAS_SOPA) as TematicaSopa[]) for (const d of ['facil', 'medio', 'dificil'] as DificultadSopa[]) casos.push([t, d]);

  it.each(casos)('%s / %s: la cantidad de palabras pedida, cada una escrita donde dice y con las direcciones permitidas', (t, d) => {
    for (let s = 0; s < 20; s++) {
      const sopa = generarSopa(t, d, seededRandom(`${t}${d}${s}`));
      const cfg = CONFIG_SOPA[d];
      expect(sopa.grilla).toHaveLength(cfg.tamano);
      expect(sopa.grilla.every((f) => f.length === cfg.tamano && /^[A-Z]+$/.test(f))).toBe(true);
      expect(sopa.ubicaciones.length).toBe(Math.min(cfg.palabras, sopa.ubicaciones.length));
      expect(sopa.ubicaciones.length).toBeGreaterThanOrEqual(cfg.palabras - 1);
      for (const u of sopa.ubicaciones) {
        expect(celdasDe(u).map(({ f, c }) => sopa.grilla[f][c]).join('')).toBe(u.palabra);
        expect(cfg.dirs.some(([df, dc]) => df === u.df && dc === u.dc)).toBe(true);
      }
    }
  });

  it('en fácil sólo horizontal y vertical; en difícil también al revés', () => {
    expect(CONFIG_SOPA.facil.dirs).toEqual([[0, 1], [1, 0]]);
    expect(CONFIG_SOPA.dificil.dirs).toContainEqual([0, -1]);
    expect(CONFIG_SOPA.dificil.dirs).toContainEqual([-1, -1]);
  });
});

describe('reglas', () => {
  it('líneas rectas: horizontal, vertical y diagonal; otras no', () => {
    expect(celdasDeLinea({ f: 0, c: 0 }, { f: 0, c: 3 })).toHaveLength(4);
    expect(celdasDeLinea({ f: 3, c: 3 }, { f: 0, c: 0 })).toEqual([{ f: 3, c: 3 }, { f: 2, c: 2 }, { f: 1, c: 1 }, { f: 0, c: 0 }]);
    expect(celdasDeLinea({ f: 0, c: 0 }, { f: 1, c: 3 })).toBeNull();
  });

  it('una palabra se encuentra marcándola en cualquiera de los dos sentidos', () => {
    const sopa = { grilla: ['MESSI', 'XXXXX'], ubicaciones: [{ palabra: 'MESSI', f: 0, c: 0, df: 0, dc: 1 }] };
    expect(buscarPalabra(sopa, { f: 0, c: 0 }, { f: 0, c: 4 })?.palabra).toBe('MESSI');
    expect(buscarPalabra(sopa, { f: 0, c: 4 }, { f: 0, c: 0 })?.palabra).toBe('MESSI');
    expect(buscarPalabra(sopa, { f: 0, c: 0 }, { f: 0, c: 3 })).toBeNull();
  });

  it('puntos por palabra, bonus al completarla y multiplicador por dificultad', () => {
    expect(puntosSopa('facil', ['MESSI'], 6, 100)).toBe(10);
    expect(puntosSopa('facil', ['MESSI', 'PELE'], 2, 90)).toBe(10 + 9 + 30 + 30);
    expect(puntosSopa('dificil', ['MESSI'], 10, 0)).toBe(16);
  });
});

describe('SopaService', () => {
  let state: Record<string, unknown> | null = null;
  const results = {
    closeAbandoned: jest.fn(),
    createMatch: jest.fn(async (_u: string, _g: string, s: Record<string, unknown>) => { state = s; return { id: 'm1' }; }),
    loadActive: jest.fn(async () => ({ state })),
    saveState: jest.fn(async (_id: string, s: Record<string, unknown>) => { state = s; }),
    finish: jest.fn(async () => ({ newAchievements: [], gameStats: {} })),
  };
  // Sin nada visto: elige como siempre (los tests de no repetir están en games/vistos.spec.ts)
  const sinVistos = { leer: jest.fn(async () => new Map<string, number>()), marcar: jest.fn(async () => undefined) };
  const service = new SopaService(results as never, sinVistos as never);
  const ubic = () => (state as unknown as { sopa: { ubicaciones: { palabra: string; f: number; c: number; df: number; dc: number }[] } }).sopa.ubicaciones;
  const fin = (u: { palabra: string; f: number; c: number; df: number; dc: number }) => ({ f: u.f + u.df * (u.palabra.length - 1), c: u.c + u.dc * (u.palabra.length - 1) });

  beforeEach(() => { jest.clearAllMocks(); state = null; });

  it('al empezar manda la grilla y las palabras pero no dónde están', async () => {
    const v = await service.empezar('u1', 'jugadores', 'facil', seededRandom('x'));
    expect(v.grilla).toHaveLength(10);
    expect(v.palabras.length).toBe(6);
    expect(v.encontradas).toEqual([]);
    expect(JSON.stringify(v)).not.toMatch(/"df"|"dc"|ubicaciones/);
  });

  it('verifica cada marca; al encontrar todas, termina y gana', async () => {
    const t0 = Date.now();
    await service.empezar('u1', 'selecciones', 'medio', seededRandom('y'));
    const mal = await service.marcar('u1', 'm1', { f: 0, c: 0 }, { f: 1, c: 3 }, t0 + 1000);
    expect(mal).toMatchObject({ ok: false, motivo: 'Marcá en línea recta.' });
    const [primera, ...resto] = ubic();
    const ok = await service.marcar('u1', 'm1', fin(primera), { f: primera.f, c: primera.c }, t0 + 2000); // al revés también vale
    expect(ok).toMatchObject({ ok: true, palabra: primera.palabra });
    expect(await service.marcar('u1', 'm1', { f: primera.f, c: primera.c }, fin(primera), t0 + 2500)).toMatchObject({ ok: false, motivo: 'Esa ya la encontraste.' });
    let r: Record<string, unknown> = {};
    for (const u of resto) r = await service.marcar('u1', 'm1', { f: u.f, c: u.c }, fin(u), t0 + 3000);
    expect(r).toMatchObject({ terminada: true, gano: true });
    expect(results.finish).toHaveBeenCalledWith('u1', 'm1', 'sopa_de_letras', expect.objectContaining({ won: true }), expect.anything());
  });

  it('después del tiempo, marcar termina la partida con lo encontrado', async () => {
    const t0 = Date.now();
    await service.empezar('u1', 'estadios', 'facil', seededRandom('z'));
    const u = ubic()[0];
    const r = await service.marcar('u1', 'm1', { f: u.f, c: u.c }, fin(u), t0 + CONFIG_SOPA.facil.segundos * 1000 + GRACIA_MS + 1000);
    expect(r).toMatchObject({ terminada: true, gano: false, puntos: 0 });
  });

  it('celda fuera de la grilla → 400', async () => {
    await service.empezar('u1', 'tecnicos', 'facil', seededRandom('w'));
    await expect(service.marcar('u1', 'm1', { f: 0, c: 0 }, { f: 0, c: 25 })).rejects.toThrow(BadRequestException);
  });
});
