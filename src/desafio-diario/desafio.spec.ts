import { ConflictException } from '@nestjs/common';
import { diaAnterior, msHastaMedianoche, preguntasDelDia, textoCompartir } from './desafio-rules';
import { DesafioService } from './desafio.service';
import { preguntaPorId, SEGUNDOS_POR_PREGUNTA, GRACIA_MS } from '../trivia/trivia-rules';
import { ACHIEVEMENTS } from '../achievements/achievements.definitions';

describe('reglas del desafío del día', () => {
  it('la misma serie para todos el mismo día, distinta otro día; 1 fácil, 2 medias y 2 difíciles', () => {
    const a = preguntasDelDia('2026-10-12');
    expect(preguntasDelDia('2026-10-12')).toEqual(a);
    expect(preguntasDelDia('2026-10-13').map((p) => p.id)).not.toEqual(a.map((p) => p.id));
    expect(a.map((p) => preguntaPorId(p.id).dificultad)).toEqual(['facil', 'medio', 'medio', 'dificil', 'dificil']);
    for (const p of a) expect(p.opciones[p.correcta]).toBe(preguntaPorId(p.id).correcta);
  });

  it('el texto para compartir no tiene spoilers', () => {
    const t = textoCompartir('2026-10-12', 'VXVTV', 3, 4);
    expect(t).toContain('12/10/2026');
    expect(t).toContain('🟩🟥🟩⬛🟩 3/5');
    expect(t).toContain('Racha: 4 días');
    const preguntas = preguntasDelDia('2026-10-12').map((p) => preguntaPorId(p.id));
    for (const p of preguntas) expect(t).not.toContain(p.correcta);
  });

  it('cambia a medianoche de Argentina', () => {
    expect(msHastaMedianoche(Date.parse('2026-10-13T02:59:00Z'))).toBe(60_000); // 23:59 en Argentina
    expect(msHastaMedianoche(Date.parse('2026-10-13T03:00:00Z'))).toBe(24 * 3600_000);
    expect(diaAnterior('2026-11-01')).toBe('2026-10-31');
  });
});

describe('DesafioService', () => {
  const T0 = Date.parse('2026-10-12T15:00:00Z'); // 12/10 al mediodía en Argentina
  let filas: Record<string, { user_id: string; day: string; match_id: string; completed: boolean; racha: number; aciertos: number; resultado: string; puntos: number; ms_total: number }>;
  let estado: Record<string, unknown> | null;
  const prisma = {
    daily_challenges: {
      findUnique: jest.fn(async ({ where }: { where: { user_id_day: { user_id: string; day: string } } }) =>
        filas[`${where.user_id_day.user_id}|${where.user_id_day.day}`] ?? null),
      create: jest.fn(async ({ data }: { data: { user_id: string; day: string; match_id: string } }) => {
        const f = { ...data, completed: false, racha: 0, aciertos: 0, resultado: '', puntos: 0, ms_total: 0 };
        filas[`${data.user_id}|${data.day}`] = f;
        return f;
      }),
      update: jest.fn(async ({ where, data }: { where: { match_id: string }; data: object }) => {
        const f = Object.values(filas).find((x) => x.match_id === where.match_id)!;
        Object.assign(f, data);
        return f;
      }),
      findMany: jest.fn(),
    },
    matches: { delete: jest.fn() },
  };
  const results = {
    createMatch: jest.fn(async (_u: string, _g: string, s: Record<string, unknown>) => { estado = s; return { id: 'm1' }; }),
    loadActive: jest.fn(async () => ({ state: estado })),
    saveState: jest.fn(async (_id: string, s: Record<string, unknown>) => { estado = s; }),
    finish: jest.fn(async () => ({ newAchievements: [], gameStats: {} })),
  };
  const service = new DesafioService(prisma as never, results as never);
  const correctas = () => (estado as unknown as { preguntas: { correcta: number }[] }).preguntas.map((p) => p.correcta);

  beforeEach(() => {
    jest.clearAllMocks();
    filas = {};
    estado = null;
  });

  it('se juega una sola vez por día y suma la racha si jugó ayer', async () => {
    filas['u1|2026-10-11'] = { user_id: 'u1', day: '2026-10-11', match_id: 'ayer', completed: true, racha: 3, aciertos: 2, resultado: 'VVXXT', puntos: 40, ms_total: 1 };
    const r = await service.empezar('u1', T0);
    expect(r).toMatchObject({ dia: '2026-10-12', total: 5 });
    expect(JSON.stringify(r)).not.toMatch(/"correcta"/);
    const ok = correctas();
    let fin: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) fin = await service.responder('u1', 'm1', i === 2 ? (ok[i] + 1) % 4 : ok[i], T0 + 1000 * (i + 1));
    expect(fin).toMatchObject({ terminada: true, gano: true, aciertos: 4, racha: 4, marcas: 'VVXVV' });
    expect(String(fin.compartir)).toContain('🟩🟩🟥🟩🟩 4/5');
    expect(results.finish).toHaveBeenCalledWith('u1', 'm1', 'trivia_diaria',
      expect.objectContaining({ won: true, extra: { aciertos: 4, total: 5, racha: 4 } }), expect.anything());
    await expect(service.empezar('u1', T0 + 60_000)).rejects.toThrow(ConflictException);
    const hoy = await service.hoy('u1', T0 + 60_000);
    expect(hoy).toMatchObject({ jugado: true, racha: 4, resultado: { aciertos: 4, marcas: 'VVXVV' } });
  });

  it('si no jugó ayer, la racha arranca de nuevo', async () => {
    await service.empezar('u1', T0);
    let fin: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) fin = await service.responder('u1', 'm1', null, T0 + 1000);
    expect(fin).toMatchObject({ racha: 1, gano: false, marcas: 'TTTTT' });
    expect((await service.hoy('u2', T0)).racha).toBe(0);
  });

  it('si recarga, retoma donde estaba; si la pregunta venció mientras no estaba, cuenta como sin tiempo', async () => {
    await service.empezar('u1', T0);
    await service.responder('u1', 'm1', correctas()[0], T0 + 2000);
    const vuelta = await service.empezar('u1', T0 + 2000 + 5000);
    expect(vuelta).toMatchObject({ aciertos: 1, pregunta: { numero: 2, restantes: SEGUNDOS_POR_PREGUNTA - 5 } });
    const tarde = await service.empezar('u1', T0 + 2000 + (SEGUNDOS_POR_PREGUNTA * 1000 + GRACIA_MS + 1000));
    expect(tarde).toMatchObject({ pregunta: { numero: 3 } });
    expect((estado as unknown as { respuestas: { marca: string }[] }).respuestas.map((r) => r.marca)).toEqual(['V', 'T']);
  });

  it('logros del desafío', () => {
    const logro = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;
    const base = { matchesPlayed: 1, matchesWon: 1, totalPoints: 0, currentStreak: 1, mode: 'solo' as const, game: 'trivia_diaria' as const, won: true };
    expect(logro('diaria_perfecta').isUnlocked({ ...base, extra: { aciertos: 5, total: 5 } })).toBe(true);
    expect(logro('diaria_racha_7').isUnlocked({ ...base, extra: { racha: 7 } })).toBe(true);
    expect(logro('diaria_racha_7').isUnlocked({ ...base, extra: { racha: 6 } })).toBe(false);
    expect(logro('diaria_racha_30').isUnlocked({ ...base, extra: { racha: 30 } })).toBe(true);
  });
});
