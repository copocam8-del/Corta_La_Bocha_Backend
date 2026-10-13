import { BadRequestException, ConflictException } from '@nestjs/common';
import { BANCO } from './ahorcado-bank';
import { completa, letrasDe, MAX_ERRORES, mascara, mismaRespuesta, normalizar, puntos } from './ahorcado-rules';
import { AhorcadoService } from './ahorcado.service';
import { ACHIEVEMENTS } from '../achievements/achievements.definitions';

describe('banco del ahorcado', () => {
  const todas = Object.values(BANCO).flat();
  it('sin repetidos, todas con letras y tamaños razonables', () => {
    const claves = todas.map((p) => normalizar(p.texto));
    expect(new Set(claves).size).toBe(claves.length);
    for (const p of todas) {
      expect(letrasDe(p.texto).size).toBeGreaterThanOrEqual(3);
      expect(p.texto.length).toBeLessThanOrEqual(30);
    }
    for (const lista of Object.values(BANCO)) expect(lista.length).toBeGreaterThanOrEqual(30);
  });
});

describe('reglas', () => {
  it('ignora tildes y mayúsculas pero respeta la Ñ', () => {
    expect(normalizar('Pelé')).toBe('PELE');
    expect(normalizar('España')).toBe('ESPAÑA');
    expect(normalizar('Modrić')).toBe('MODRIC');
    expect(normalizar('Jürgen')).toBe('JURGEN');
  });

  it('la máscara oculta letras y muestra espacios y signos', () => {
    expect(mascara("Newell's Old Boys", ['O']).join('')).toBe("______'_ O__ _O__");
    expect(mascara('Pelé', ['E']).join('')).toBe('_E_E');
    expect(completa('Pelé', ['P', 'E', 'L'])).toBe(true);
  });

  it('puntos: base por dificultad, menos errores, más rapidez; perder = 0', () => {
    expect(puntos('facil', 0, 0, true)).toBe(90);
    expect(puntos('dificil', 2, 50, true)).toBe(130 - 20 + 20);
    expect(puntos('medio', 5, 600, true)).toBe(40);
    expect(puntos('facil', 6, 600, true)).toBe(10); // mínimo al ganar
    expect(puntos('dificil', 0, 0, false)).toBe(0);
  });

  it('arriesgar compara sin tildes ni signos', () => {
    expect(mismaRespuesta('angel di maria', 'Ángel Di María')).toBe(true);
    expect(mismaRespuesta('newells old boys', "Newell's Old Boys")).toBe(true);
    expect(mismaRespuesta('di maria', 'Ángel Di María')).toBe(false);
    expect(mismaRespuesta('   ', 'Pelé')).toBe(false);
  });
});

describe('AhorcadoService', () => {
  let state: Record<string, unknown> | null = null;
  const results = {
    closeAbandoned: jest.fn(),
    createMatch: jest.fn(async (_u: string, _g: string, s: Record<string, unknown>) => {
      state = s;
      return { id: 'm1' };
    }),
    loadActive: jest.fn(async () => ({ state })),
    saveState: jest.fn(async (_id: string, s: Record<string, unknown>) => {
      state = s;
    }),
    finish: jest.fn(async () => ({ newAchievements: [], gameStats: {} })),
  };
  // Sin nada visto: elige como siempre (los tests de no repetir están en games/vistos.spec.ts)
  const sinVistos = { leer: jest.fn(async () => new Map<string, number>()), marcar: jest.fn(async () => undefined) };
  const service = new AhorcadoService(results as never, sinVistos as never);
  const primera = () => 0; // elige la primera palabra de la lista

  beforeEach(() => {
    jest.clearAllMocks();
    state = null;
  });

  it('al empezar no manda la respuesta: sólo la pista y la máscara', async () => {
    const v = await service.empezar('u1', 'facil', primera);
    expect(JSON.stringify(v)).not.toContain('Messi');
    expect(v).toMatchObject({ pista: 'Jugador', mascara: ['_', '_', '_', '_', '_'], errores: 0, maxErrores: MAX_ERRORES });
    expect(results.closeAbandoned).toHaveBeenCalledWith('u1', 'ahorcado', expect.any(Number));
  });

  it('el servidor corrige cada letra; al completar gana y recién ahí muestra la respuesta', async () => {
    await service.empezar('u1', 'facil', primera); // MESSI
    expect((await service.letra('u1', 'm1', 'm')).mascara.join('')).toBe('M____');
    expect((await service.letra('u1', 'm1', 'z')).errores).toBe(1);
    await expect(service.letra('u1', 'm1', 'Z')).rejects.toThrow(BadRequestException); // repetida
    await expect(service.letra('u1', 'm1', '7')).rejects.toThrow(BadRequestException);
    await service.letra('u1', 'm1', 'e');
    await service.letra('u1', 'm1', 's');
    const fin = await service.letra('u1', 'm1', 'i');
    expect(fin).toMatchObject({ terminada: true, gano: true, respuesta: 'Messi' });
    expect((fin as unknown as { puntos: number }).puntos).toBeGreaterThan(0);
    expect(results.finish).toHaveBeenCalledWith('u1', 'm1', 'ahorcado',
      expect.objectContaining({ won: true, extra: expect.objectContaining({ errores: 1, dificultad: 'facil' }) }), expect.anything());
  });

  it(`con ${MAX_ERRORES} errores muere la redonda: pierde con 0 puntos`, async () => {
    await service.empezar('u1', 'facil', primera); // MESSI
    let v: { terminada: boolean; gano?: boolean; puntos?: number } = { terminada: false };
    for (const l of 'ABCDFG') v = await service.letra('u1', 'm1', l);
    expect(v).toMatchObject({ terminada: true, gano: false, puntos: 0 });
  });

  it('arriesgar bien gana; arriesgar mal cuesta un error', async () => {
    await service.empezar('u1', 'facil', primera);
    expect((await service.arriesgar('u1', 'm1', 'Pele')).errores).toBe(1);
    expect(await service.arriesgar('u1', 'm1', 'messi')).toMatchObject({ terminada: true, gano: true });
  });

  it('si la partida ya terminó (doble clic), 409', async () => {
    await service.empezar('u1', 'facil', primera);
    results.finish.mockResolvedValueOnce(null as never);
    await expect(service.rendirse('u1', 'm1')).rejects.toThrow(ConflictException);
  });

  it('logros del ahorcado', () => {
    const logro = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;
    const base = { matchesPlayed: 1, matchesWon: 1, totalPoints: 0, currentStreak: 1, mode: 'solo' as const, game: 'ahorcado' as const };
    expect(logro('redonda_intacta').isUnlocked({ ...base, won: true, extra: { errores: 0 } })).toBe(true);
    expect(logro('redonda_intacta').isUnlocked({ ...base, won: true, extra: { errores: 1 } })).toBe(false);
    expect(logro('ahorcado_crack').isUnlocked({ ...base, won: true, extra: { dificultad: 'dificil' } })).toBe(true);
    expect(logro('ahorcado_diez').isUnlocked({ ...base, won: true, gameMatchesWon: 10 })).toBe(true);
  });
});
