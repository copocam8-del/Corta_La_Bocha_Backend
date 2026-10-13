import type { Prisma } from '@prisma/client';
import { AdminService } from './admin.service';
import { PREGUNTAS } from '../trivia/trivia-bank';

const AHORA = new Date('2026-10-13T18:00:00Z');

// Base falsa: cada consulta del panel lleva un comentario /* admin:… */ para saber cuál es
function setup() {
  const respuestas: Record<string, unknown[]> = {
    'admin:usuarios': [{ total: 120n, nuevos: 7n, con_google: 3n, con_contrasena: 4n }],
    'admin:usuarios-por-dia': [{ dia: '2026-10-12', cantidad: 5n }, { dia: '2026-10-13', cantidad: 2n }],
    'admin:activos': [{ hoy: 4n, semana: 15n, mes: 40n }],
    'admin:partidas': [
      { game: 'tutti_frutti', mode: 'vs_ai', status: 'finished', cantidad: 6n },
      { game: 'tutti_frutti', mode: 'vs_ai', status: 'abandoned', cantidad: 1n },
      { game: 'memotest', mode: 'multiplayer', status: 'finished', cantidad: 2n },
    ],
    'admin:partidas-por-dia': [{ dia: '2026-10-13', game: 'tutti_frutti', cantidad: 7n }],
    'admin:abandonos-multi': [{ cantidad: 1n }],
    'admin:top': [{ username: 'messi10', puntos: 300n, partidas: 4n, ganadas: 3n }],
    'admin:ia-partidas': [{ validadas: 37n, sin_validar: 3n }],
    'admin:ia-respuestas': [{ validas: 150n, evaluadas: 200n }],
    'admin:trivia': [{ id: PREGUNTAS[0].id, veces: 5n, aciertos: 1n }],
    'admin:ahorcado': [{ palabra: 'GAMBETA', jugadas: 4n, derrotas: 2n }],
    'admin:temas': [
      { game: 'sopa_de_letras', tema: 'clubes_argentinos', cantidad: 3n },
      { game: 'memotest', tema: 'clubes_apodos', cantidad: 2n },
    ],
    'admin:letras': [{ letra: 'M', cantidad: 9n }, { letra: 'B', cantidad: 4n }],
  };
  const consultas: Prisma.Sql[] = [];
  const prisma = {
    $queryRaw: jest.fn(async (q: Prisma.Sql) => {
      consultas.push(q);
      const tag = /\/\* (admin:[a-z-]+) \*\//.exec(q.sql)?.[1];
      if (!tag || !(tag in respuestas)) throw new Error(`consulta sin respuesta: ${q.sql.slice(0, 60)}`);
      return respuestas[tag];
    }),
    users: {
      findMany: jest.fn(async () => [
        { username: 'nuevo1', email: 'nuevo1@mail.com', created_at: new Date('2026-10-13T12:00:00Z'), google_id: '1234567890' },
        { username: 'nuevo2', email: 'nuevo2@mail.com', created_at: new Date('2026-10-12T12:00:00Z'), google_id: null },
      ]),
    },
  };
  const multiplayer = {
    engine: { liveSummary: () => ({ salas: 2, jugando: 1, conectados: 5, porJuego: { trivia: { salas: 2, jugando: 1, conectados: 5 } } }) },
    queue: { waiting: 3 },
  };
  const env: Record<string, string> = { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'clave-super-secreta' };
  const config = { get: (k: string) => env[k] };
  const validator = { providerInfo: { name: 'gemini', model: 'gemini-3.8-flash' } };
  const service = new AdminService(prisma as never, multiplayer as never, config as never, validator as never);
  return { service, prisma, consultas };
}

describe('AdminService (panel, sólo lectura)', () => {
  it('usuarios: totales, por día, Google vs contraseña, activos y últimos registros', async () => {
    const { service, prisma } = setup();
    const r = await service.usuarios('7d', AHORA);
    expect(r).toMatchObject({ total: 120, nuevos: 7, conGoogle: 3, conContrasena: 4, activos: { hoy: 4, semana: 15, mes: 40 } });
    expect(r.nuevosPorDia).toHaveLength(7);
    expect(r.nuevosPorDia.slice(-2)).toEqual([{ dia: '2026-10-12', cantidad: 5 }, { dia: '2026-10-13', cantidad: 2 }]);
    expect(r.ultimosRegistros[0]).toEqual({ username: 'nuevo1', email: 'nuevo1@mail.com', creado: expect.any(Date), conGoogle: true });
    // Últimos 20, y sólo usuario, email, fecha y si tiene Google
    const arg = (prisma.users.findMany.mock.calls[0] as unknown[])[0] as { take: number; select: Record<string, boolean> };
    expect(arg.take).toBe(20);
    expect(Object.keys(arg.select).sort()).toEqual(['created_at', 'email', 'google_id', 'username']);
  });

  it('partidas: por juego, solo vs multijugador, abandonadas, en vivo y top', async () => {
    const { service } = setup();
    const r = await service.partidas('hoy', AHORA);
    expect(r).toMatchObject({ total: 9, solo: 7, multijugador: 2, abandonadas: 1, abandonosMultijugador: 1 });
    expect(r.porDia).toEqual([{ dia: '2026-10-13', total: 7, juegos: { tutti_frutti: 7 } }]);
    expect(r.enVivo).toMatchObject({ salas: 2, jugando: 1, conectados: 5, enCola: 3 });
    expect(r.top).toEqual([{ username: 'messi10', puntos: 300, partidas: 4, ganadas: 3 }]);
  });

  it('IA: validadas vs sin validar, % de válidas, proveedor (sin la clave) y gasto estimado', async () => {
    const { service } = setup();
    const r = await service.ia('30d', AHORA);
    expect(r).toMatchObject({
      proveedor: 'gemini', modelo: 'gemini-3.8-flash', configurado: true,
      partidasValidadas: 37, partidasSinValidar: 3, porcentajeSinValidar: 7.5, porcentajeValidas: 75, gastoEstimadoUsd: 0.37,
    });
    expect(r.notaGasto).toContain('Estimado');
  });

  it('contenido: preguntas, palabras, temas con nombre y letras; avisa lo que no se guarda', async () => {
    const { service } = setup();
    const r = await service.contenido('todo', AHORA);
    expect(r.trivia.masFalladas[0]).toEqual({ id: PREGUNTAS[0].id, texto: PREGUNTAS[0].texto, veces: 5, porcentaje: 20 });
    expect(r.ahorcado).toEqual([{ id: 'GAMBETA', texto: 'GAMBETA', veces: 4, porcentaje: 50 }]);
    expect(r.sopa).toEqual([{ id: 'clubes_argentinos', nombre: 'Clubes argentinos', cantidad: 3 }]);
    expect(r.memotest[0]).toMatchObject({ id: 'clubes_apodos', cantidad: 2 });
    expect(r.letras[0]).toEqual({ letra: 'M', cantidad: 9 });
    expect(r.sinDatos.join(' ')).toMatch(/multijugador/);
  });

  it('nada sensible en ninguna respuesta: contraseñas, hashes, tokens, fechas de nacimiento, id de Google ni claves', async () => {
    const { service } = setup();
    const todo = JSON.stringify(await Promise.all([
      service.usuarios('todo', AHORA), service.partidas('todo', AHORA), service.ia('todo', AHORA), service.contenido('todo', AHORA),
    ]));
    for (const prohibido of ['password', 'hash', 'token', 'birth', 'google_id', '1234567890', 'clave-super-secreta', 'API_KEY']) {
      expect([prohibido, todo.includes(prohibido)]).toEqual([prohibido, false]);
    }
  });

  it('sólo lectura: todas las consultas son SELECT, con el período como parámetro', async () => {
    const { service, consultas } = setup();
    await Promise.all([service.usuarios('7d', AHORA), service.partidas('7d', AHORA), service.ia('7d', AHORA), service.contenido('7d', AHORA)]);
    expect(consultas.length).toBe(13);
    for (const q of consultas) {
      expect(q.sql).toMatch(/^\/\* admin:[a-z-]+ \*\/\s+SELECT/);
      expect(q.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
    }
    // El "desde" de 7 días va como texto UTC
    expect(consultas.some((q) => q.values.includes('2026-10-07T03:00:00.000Z'))).toBe(true);
  });
});
