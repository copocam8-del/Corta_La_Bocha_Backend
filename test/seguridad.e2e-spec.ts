// Tests de seguridad de punta a punta: app completa + PostgreSQL LOCAL (ver e2e-env.ts) + HTTP y Socket.IO reales.
//   npm run db:local                       (en otra terminal: levanta la base local)
//   npx jest --config test/jest-e2e.json test/seguridad
// En el CI corren contra una PostgreSQL de servicio (ver .github/workflows/ci.yml).
//
// 1. Aislamiento: un usuario no puede leer ni jugar partidas de otro (404).
// 2. Las respuestas públicas nunca traen datos privados (hash, email, fecha de nacimiento, Google, nombre real).
// 3. Payloads raros (tipo equivocado, null, objetos, strings gigantes) nunca dan 500 ni tiran el server;
//    en Socket.IO siempre vuelve una respuesta { ok: false }.
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AdminThrottlerGuard } from '../src/admin/admin-throttler.guard';
import { TEMATICAS, DIFICULTADES } from '../src/solo-matches/solo-quick';
import { TEMATICAS_SOPA } from '../src/sopa/sopa-rules';
import { TEMAS_MEMOTEST } from '../src/memotest/memotest-rules';
import { PrismaService } from '../src/prisma/prisma.service';
import { TERMS_VERSION } from '../src/legal/terminos';

jest.setTimeout(120_000);

const RUN = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const A = {
  email: `a-${RUN}@correo-e2e.com.ar`,
  username: `a_${RUN}`.slice(0, 30),
  password: 'gambeta-de-potrero-A',
  name: `NombreSecretoA${RUN}`,
  lastName: `ApellidoSecretoA${RUN}`,
  birthDate: '1990-03-17',
  aceptaTerminos: true,
};
const B = {
  email: `b-${RUN}@correo-e2e.com.ar`,
  username: `b_${RUN}`.slice(0, 30),
  password: 'gambeta-de-potrero-B',
  name: `NombreSecretoB${RUN}`,
  lastName: `ApellidoSecretoB${RUN}`,
  birthDate: '1991-11-29',
  aceptaTerminos: true,
};
// A es admin: así también se prueban los endpoints de /admin con payloads raros
process.env.ADMIN_EMAILS = A.email;

const UUID_AJENO = '00000000-0000-4000-8000-000000000000';

let app: INestApplication;
let baseUrl: string;
const tokens: Record<'A' | 'B', string> = { A: '', B: '' };
const ids: Record<'A' | 'B', string> = { A: '', B: '' };
const http = () => request(app.getHttpServer());
const as = (who: 'A' | 'B') => ({ Authorization: `Bearer ${tokens[who]}` });

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    // Los límites por IP tienen sus tests; acá mandamos cientos de pedidos desde la misma IP
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(AdminThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  app = mod.createNestApplication<NestExpressApplication>();
  configureApp(app as NestExpressApplication, '');
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

  for (const [who, u] of [['A', A], ['B', B]] as const) {
    const reg = await http().post('/auth/register').send(u).expect(201);
    ids[who] = reg.body.userId;
    const log = await http().post('/auth/login').send({ email: u.email, password: u.password }).expect(201);
    tokens[who] = log.body.access_token;
  }
});

afterAll(async () => {
  await app?.close();
});

// ───────────────────────────── 1. Aislamiento entre usuarios ─────────────────────────────

describe('Aislamiento: A no puede leer ni jugar partidas de B', () => {
  const deB: Record<string, string> = {};

  beforeAll(async () => {
    const tematica = Object.keys(TEMATICAS)[0];
    const dificultad = Object.keys(DIFICULTADES)[0];
    const solo = await http().post('/solo-matches/quick').set(as('B')).send({ tematica, dificultad, tiempo: 60 }).expect(201);
    deB.solo = solo.body.matchId;
    deB.ahorcado = (await http().post('/ahorcado').set(as('B')).send({ dificultad: 'facil' }).expect(201)).body.matchId;
    deB.trivia = (await http().post('/trivia').set(as('B')).send({}).expect(201)).body.matchId;
    deB.sopa = (await http().post('/sopa').set(as('B')).send({ tematica: Object.keys(TEMATICAS_SOPA)[0], dificultad: 'facil' }).expect(201)).body.matchId;
    deB.memotest = (await http().post('/memotest').set(as('B')).send({ tema: Object.keys(TEMAS_MEMOTEST)[0], nivel: 'facil' }).expect(201)).body.matchId;
    deB.desafio = (await http().post('/desafio-diario/empezar').set(as('B')).send({}).expect(201)).body.matchId;
    for (const [juego, id] of Object.entries(deB)) {
      expect({ juego, id }).toEqual({ juego, id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    }
  });

  const intentos: [string, (id: string) => [string, object]][] = [
    ['solo-matches finish', (id) => [`/solo-matches/quick/${id}/finish`, { answers: [] }]],
    ['ahorcado letra', (id) => [`/ahorcado/${id}/letra`, { letra: 'a' }]],
    ['ahorcado arriesgar', (id) => [`/ahorcado/${id}/arriesgar`, { respuesta: 'Messi' }]],
    ['ahorcado rendirse', (id) => [`/ahorcado/${id}/rendirse`, {}]],
    ['trivia responder', (id) => [`/trivia/${id}/responder`, { opcion: 0 }]],
    ['sopa marcar', (id) => [`/sopa/${id}/marcar`, { desde: { f: 0, c: 0 }, hasta: { f: 0, c: 3 } }]],
    ['sopa terminar', (id) => [`/sopa/${id}/terminar`, {}]],
    ['memotest voltear', (id) => [`/memotest/${id}/voltear`, { carta: 0 }]],
    ['memotest rendirse', (id) => [`/memotest/${id}/rendirse`, {}]],
    ['desafío responder', (id) => [`/desafio-diario/${id}/responder`, { opcion: 0 }]],
  ];
  const juegoDe = (nombre: string) =>
    nombre.startsWith('solo') ? 'solo' : nombre.startsWith('desafío') ? 'desafio' : nombre.split(' ')[0];

  it.each(intentos)('%s con la partida de B → 404 sin datos de la partida', async (nombre, armar) => {
    const [url, body] = armar(deB[juegoDe(nombre)]);
    const res = await http().post(url).set(as('A')).send(body);
    expect(res.status).toBe(404);
    expect(Object.keys(res.body).sort()).toEqual(['error', 'message', 'statusCode']);
  });

  it.each(intentos)('%s con un id que no existe → el mismo 404', async (_nombre, armar) => {
    const [url, body] = armar(UUID_AJENO);
    expect((await http().post(url).set(as('A')).send(body)).status).toBe(404);
  });

  it('el desafío del día de A no es el de B', async () => {
    const hoy = await http().get('/desafio-diario/hoy').set(as('A')).expect(200);
    expect(JSON.stringify(hoy.body)).not.toContain(deB.desafio);
  });

  it('después de los intentos de A, las partidas de B siguen intactas y B puede jugarlas', async () => {
    const letra = await http().post(`/ahorcado/${deB.ahorcado}/letra`).set(as('B')).send({ letra: 'e' });
    expect(letra.status).toBe(201);
    expect(letra.body.terminada ?? false).toBe(false);
    await http().post(`/trivia/${deB.trivia}/responder`).set(as('B')).send({ opcion: 0 }).expect(201);
    await http().post(`/memotest/${deB.memotest}/voltear`).set(as('B')).send({ carta: 0 }).expect(201);
    await http().post(`/sopa/${deB.sopa}/terminar`).set(as('B')).expect(201);
    await http().post(`/ahorcado/${deB.ahorcado}/rendirse`).set(as('B')).expect(201);
  });

  it('sin token → 401 en todas', async () => {
    for (const [nombre, armar] of intentos) {
      const [url, body] = armar(deB[juegoDe(nombre)]);
      expect({ nombre, status: (await http().post(url).send(body)).status }).toEqual({ nombre, status: 401 });
    }
  });
});

// ───────────────────────── 2. Respuestas públicas sin datos privados ─────────────────────────

const CLAVES_PRIVADAS = [
  'password',
  'password_hash',
  'passwordHash',
  'email',
  'birth_date',
  'birthDate',
  'google_id',
  'googleId',
  'first_name',
  'firstName',
  'last_name',
  'lastName',
];

// Recorre todo el JSON y devuelve las rutas de las claves prohibidas
function clavesPrivadas(x: unknown, ruta = '$'): string[] {
  if (Array.isArray(x)) return x.flatMap((v, i) => clavesPrivadas(v, `${ruta}[${i}]`));
  if (x && typeof x === 'object') {
    return Object.entries(x).flatMap(([k, v]) => [
      ...(CLAVES_PRIVADAS.includes(k) ? [`${ruta}.${k}`] : []),
      ...clavesPrivadas(v, `${ruta}.${k}`),
    ]);
  }
  return [];
}

function expectSinDatosPrivados(url: string, body: unknown) {
  expect({ url, claves: clavesPrivadas(body) }).toEqual({ url, claves: [] });
  const texto = JSON.stringify(body);
  for (const u of [A, B]) {
    for (const secreto of [u.email, u.birthDate, u.name, u.lastName]) {
      expect({ url, filtra: texto.includes(secreto) ? secreto : null }).toEqual({ url, filtra: null });
    }
  }
}

describe('Respuestas públicas: nunca hash, email, fecha de nacimiento, Google ni nombre real', () => {
  let code: string;

  beforeAll(async () => {
    // Una partida terminada para que A y B aparezcan en los rankings, y una sala con los dos adentro
    for (const who of ['A', 'B'] as const) {
      const p = await http().post('/ahorcado').set(as(who)).send({ dificultad: 'facil' }).expect(201);
      await http().post(`/ahorcado/${p.body.matchId}/rendirse`).set(as(who)).expect(201);
    }
    code = (await http().post('/rooms').set(as('A')).send({}).expect(201)).body.code;
    const a = await conectar('A');
    const b = await conectar('B');
    expect((await emitir(a, 'room:join', { code })).ok).toBe(true);
    expect((await emitir(b, 'room:join', { code })).ok).toBe(true);
    a.disconnect();
    b.disconnect();
  });

  const publicas = () => [
    '/users',
    `/users/${ids.A}`,
    `/users/${ids.B}`,
    '/users/ranking',
    '/users/ranking?period=global',
    '/users/ranking?period=semanal',
    '/users/ranking?period=mensual',
    '/users/ranking?period=elo',
    '/users/ranking?game=ahorcado',
    '/users/ranking?game=ahorcado&period=semanal',
    `/rooms/${code}`,
    '/desafio-diario/tabla',
    '/games',
    '/categories',
  ];

  it('las respuestas públicas (vistas por A, por B y sin sesión) no traen datos privados', async () => {
    for (const url of publicas()) {
      for (const headers of [as('A'), as('B'), {}]) {
        const res = await http().get(url).set(headers);
        if (res.status === 401) continue; // pide sesión
        expect({ url, status: res.status }).toEqual({ url, status: 200 });
        expectSinDatosPrivados(url, res.body);
      }
    }
  });

  it('el ranking muestra a B y la sala tiene a los dos (el test revisa datos reales)', async () => {
    const ranking = await http().get('/users/ranking?game=ahorcado').set(as('A')).expect(200);
    expect(JSON.stringify(ranking.body)).toContain(B.username);
    const sala = await http().get(`/rooms/${code}`).set(as('B')).expect(200);
    expect(sala.body.players).toBe(2);
  });

  it('el estado de la sala por Socket.IO tampoco trae datos privados', async () => {
    const b = await conectar('B');
    const estado = esperarEstado(b, () => true);
    await emitir(b, 'room:join', { code });
    expectSinDatosPrivados('room:state', await estado);
    b.disconnect();
  });

  it('/users/me sí trae los datos propios (y nunca el hash)', async () => {
    const me = await http().get('/users/me').set(as('A')).expect(200);
    expect(JSON.stringify(me.body)).toContain(A.email);
    expect(JSON.stringify(me.body)).not.toMatch(/password|\$2[aby]\$/);
  });
});

// ─────────────────────────────── 3. Payloads raros por HTTP ───────────────────────────────

const GIGANTE = 'x'.repeat(50_000);
const RAROS: unknown[] = [
  null,
  '',
  GIGANTE,
  12345,
  -1,
  1.5,
  1e308,
  true,
  [],
  ['a', 1, null],
  {},
  { $gt: '' },
  { __proto__: { admin: true } },
  { a: { b: { c: { d: [] } } } },
];

// Cada endpoint con un body válido: se reemplaza cada campo por cada valor raro
// permitir503: sin GOOGLE_CLIENT_ID, /auth/google responde 503 a propósito ("no disponible"), no es una caída
type Caso = { metodo: 'post' | 'put'; url: () => string; auth?: 'A' | 'B'; body: Record<string, unknown>; permitir503?: boolean };
let partidaA: Record<string, string> = {};
const CASOS: Caso[] = [
  { metodo: 'post', url: () => '/auth/register', body: { username: 'zz_raro', name: 'N', lastName: 'L', birthDate: '1990-01-01', country: 'AR', email: 'raro@correo-e2e.com.ar', password: 'gambeta-de-potrero', captchaToken: 't', aceptaTerminos: true } },
  { metodo: 'post', url: () => '/users/me/aceptar-terminos', auth: 'B', body: { version: TERMS_VERSION } },
  { metodo: 'post', url: () => '/auth/login', body: { email: 'nadie@correo-e2e.com.ar', password: 'x' } },
  { metodo: 'post', url: () => '/auth/google', body: { credential: 'x' }, permitir503: true },
  { metodo: 'post', url: () => '/auth/forgot-password', body: { email: 'nadie@correo-e2e.com.ar' } },
  { metodo: 'post', url: () => '/auth/reset-password', body: { token: 'x', password: 'gambeta-de-potrero' } },
  { metodo: 'put', url: () => '/users/me', auth: 'A', body: { username: A.username, first_name: 'N', last_name: 'L', bio: 'hola', avatar_id: 'pelota', favorite_team: 'Boca', favorite_country: 'AR', favorite_player: 'Riquelme' } },
  { metodo: 'post', url: () => '/rooms', auth: 'A', body: { game: 'trivia', tematica: 'todas', dificultad: 'facil', rounds: 5, seconds: 10 } },
  { metodo: 'post', url: () => '/solo-matches/quick', auth: 'A', body: { tematica: Object.keys(TEMATICAS)[0], dificultad: Object.keys(DIFICULTADES)[0], tiempo: 60 } },
  { metodo: 'post', url: () => `/solo-matches/quick/${partidaA.solo}/finish`, auth: 'A', body: { answers: [{ category: 'Jugador', answer: 'Messi' }] } },
  { metodo: 'post', url: () => '/tutti-frutti/validate-round', auth: 'A', body: { roundLetter: 'M', answers: [{ category: 'Jugador', answer: 'Messi' }] } },
  { metodo: 'post', url: () => '/ahorcado', auth: 'A', body: { dificultad: 'facil' } },
  { metodo: 'post', url: () => `/ahorcado/${partidaA.ahorcado}/letra`, auth: 'A', body: { letra: 'a' } },
  { metodo: 'post', url: () => `/ahorcado/${partidaA.ahorcado}/arriesgar`, auth: 'A', body: { respuesta: 'zzz' } },
  { metodo: 'post', url: () => '/trivia', auth: 'A', body: { categoria: 'Mundiales', dificultad: 'facil' } },
  { metodo: 'post', url: () => `/trivia/${partidaA.trivia}/responder`, auth: 'A', body: { opcion: 0 } },
  { metodo: 'post', url: () => '/sopa', auth: 'A', body: { tematica: Object.keys(TEMATICAS_SOPA)[0], dificultad: 'facil' } },
  { metodo: 'post', url: () => `/sopa/${partidaA.sopa}/marcar`, auth: 'A', body: { desde: { f: 0, c: 0 }, hasta: { f: 0, c: 3 } } },
  { metodo: 'post', url: () => '/memotest', auth: 'A', body: { tema: Object.keys(TEMAS_MEMOTEST)[0], nivel: 'facil' } },
  { metodo: 'post', url: () => `/memotest/${partidaA.memotest}/voltear`, auth: 'A', body: { carta: 0 } },
  { metodo: 'post', url: () => `/desafio-diario/${partidaA.desafio}/responder`, auth: 'A', body: { opcion: 0 } },
  { metodo: 'post', url: () => '/impostor/local', auth: 'A', body: { tematica: 'mezcla', rondas: 3 } },
];

// Variantes de un body: cada campo (y cada subcampo) reemplazado por cada valor raro, y el body entero raro
function variantes(body: Record<string, unknown>): unknown[] {
  const out: unknown[] = [...RAROS, { ...body, extra: GIGANTE }];
  const rec = (obj: Record<string, unknown>, set: (o: Record<string, unknown>) => unknown) => {
    for (const k of Object.keys(obj)) {
      for (const raro of RAROS) out.push(set({ ...obj, [k]: raro }));
      const v = obj[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) rec(v as Record<string, unknown>, (o) => set({ ...obj, [k]: o }));
      if (Array.isArray(v) && v[0] && typeof v[0] === 'object') {
        rec(v[0] as Record<string, unknown>, (o) => set({ ...obj, [k]: [o] }));
        for (const raro of RAROS) out.push(set({ ...obj, [k]: [raro] }));
        out.push(set({ ...obj, [k]: Array.from({ length: 1000 }, () => v[0]) }));
      }
    }
  };
  rec(body, (o) => o);
  return out;
}

describe('Payloads raros por HTTP: nunca 500', () => {
  beforeAll(async () => {
    const t = Object.keys(TEMATICAS)[0];
    partidaA = {
      solo: (await http().post('/solo-matches/quick').set(as('A')).send({ tematica: t, dificultad: Object.keys(DIFICULTADES)[0], tiempo: 60 })).body.matchId,
      ahorcado: (await http().post('/ahorcado').set(as('A')).send({ dificultad: 'facil' })).body.matchId,
      trivia: (await http().post('/trivia').set(as('A')).send({})).body.matchId,
      sopa: (await http().post('/sopa').set(as('A')).send({ tematica: Object.keys(TEMATICAS_SOPA)[0], dificultad: 'facil' })).body.matchId,
      memotest: (await http().post('/memotest').set(as('A')).send({ tema: Object.keys(TEMAS_MEMOTEST)[0], nivel: 'facil' })).body.matchId,
      desafio: (await http().get('/desafio-diario/hoy').set(as('A'))).body.matchId ?? UUID_AJENO,
    };
  });

  it.each(CASOS.map((c) => [`${c.metodo.toUpperCase()} ${c.url().replace(/[0-9a-f-]{36}/, ':id')}`, c] as const))(
    '%s',
    async (_nombre, caso) => {
      const fallas: string[] = [];
      for (const body of variantes(caso.body)) {
        let req = http()[caso.metodo](caso.url());
        if (caso.auth) req = req.set(as(caso.auth));
        const res = await req.set('Content-Type', 'application/json').send(JSON.stringify(body));
        if (res.status >= 500 && !(caso.permitir503 && res.status === 503)) fallas.push(`${res.status} con ${JSON.stringify(body).slice(0, 150)}`);
      }
      expect(fallas).toEqual([]);
    },
  );

  it('JSON roto, body enorme y tipos de contenido raros → 4xx', async () => {
    const r1 = await http().post('/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(r1.status).toBe(400);
    const r2 = await http().post('/auth/login').set('Content-Type', 'application/json').send(JSON.stringify({ email: 'x'.repeat(2_000_000) }));
    expect(r2.status).toBe(413);
    const r3 = await http().post('/auth/login').set('Content-Type', 'text/plain').send('hola');
    expect(r3.status).toBe(400);
  });

  it('ids raros en la URL → 404, nunca 500', async () => {
    for (const id of ['no-es-uuid', 'x'.repeat(5000), '%00', '1 OR 1=1', '../../etc/passwd', UUID_AJENO.toUpperCase()]) {
      for (const url of [`/users/${encodeURIComponent(id)}`, `/rooms/${encodeURIComponent(id)}`, `/ahorcado/${encodeURIComponent(id)}/rendirse`]) {
        const res = await http().post(url).set(as('A'));
        expect({ url, status: res.status < 500 }).toEqual({ url, status: true });
        const get = await http().get(url).set(as('A'));
        expect({ url, status: get.status < 500 }).toEqual({ url, status: true });
      }
    }
  });

  it('query strings raros (repetidos, gigantes, con corchetes) → nunca 500', async () => {
    const queries = ['period=a&period=b', `period=${'x'.repeat(5000)}`, 'period[x]=1', 'game=a&game=b', 'game[]=x', 'periodo=a&periodo=b', 'periodo[x]=1', `periodo=${'x'.repeat(5000)}`, 'advanced=a&advanced=b', 'advanced[x]=1'];
    const urls = ['/users/ranking', '/users/me/ranking', '/categories', '/admin/usuarios', '/admin/partidas', '/admin/ia', '/admin/contenido', '/admin/nombres'];
    const fallas: string[] = [];
    for (const url of urls) {
      for (const q of queries) {
        const res = await http().get(`${url}?${q}`).set(as('A'));
        if (res.status >= 500) fallas.push(`${res.status} ${url}?${q.slice(0, 60)}`);
      }
    }
    expect(fallas).toEqual([]);
  });

  it('El Impostor en persona: sin sesión 401, datos raros 400 y una palabra por ronda (sin datos de la partida)', async () => {
    await http().post('/impostor/local').send({ tematica: 'mezcla', rondas: 3 }).expect(401);
    for (const body of [{ tematica: 'otra', rondas: 3 }, { tematica: 'mezcla', rondas: 4 }, { tematica: 'mezcla', rondas: '3' }, [], {}]) {
      expect({ body, status: (await http().post('/impostor/local').set(as('A')).send(body)).status }).toEqual({ body, status: 400 });
    }
    const res = await http().post('/impostor/local').set(as('A')).send({ tematica: 'equipos', rondas: 5 }).expect(201);
    expect(Object.keys(res.body)).toEqual(['palabras']);
    expect(res.body.palabras).toHaveLength(5);
    expect(new Set(res.body.palabras.map((p: { texto: string }) => p.texto)).size).toBe(5);
    for (const p of res.body.palabras) expect(p).toEqual({ texto: expect.any(String), categoria: 'Equipo' });
  });

  it('el server sigue vivo', async () => {
    await http().get('/games').expect(200);
  });
});

// ─────────────────────────────── 4. Payloads raros por Socket.IO ───────────────────────────────

function conectar(who: 'A' | 'B'): Promise<Socket> {
  return conectarConToken(tokens[who]);
}

function conectarConToken(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(baseUrl, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

// Manda un evento y espera la respuesta (ack). Si no llega en 3 s, es un error: el server se colgó o tiró excepción.
async function emitir(s: Socket, evento: string, ...args: unknown[]): Promise<{ ok: boolean; error?: string }> {
  return (await s.timeout(3000).emitWithAck(evento, ...args)) as { ok: boolean; error?: string };
}

function esperarEstado(s: Socket, cond: (estado: { phase?: string }) => boolean, ms = 15_000): Promise<{ phase?: string }> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no llegó el room:state esperado')), ms);
    const fn = (estado: { phase?: string }) => {
      if (!cond(estado)) return;
      clearTimeout(t);
      s.off('room:state', fn);
      resolve(estado);
    };
    s.on('room:state', fn);
  });
}

const EVENTOS = ['room:join', 'room:leave', 'room:settings', 'room:start', 'room:again', 'round:answers', 'round:basta', 'game:action', 'queue:join', 'queue:leave'];
const RAROS_WS: unknown[] = [undefined, ...RAROS.filter((r) => r !== GIGANTE), 'x'.repeat(200_000)];

// Prueba todas las variantes de un evento: siempre tiene que volver un ack con { ok: boolean }
async function fuzzEvento(s: Socket, evento: string, base: Record<string, unknown>) {
  const fallas: string[] = [];
  for (const payload of [...RAROS_WS, ...variantes(base)]) {
    try {
      const res = await emitir(s, evento, payload);
      if (typeof res?.ok !== 'boolean') fallas.push(`${evento}: respuesta sin ok con ${JSON.stringify(payload)?.slice(0, 100)}`);
    } catch {
      fallas.push(`${evento}: sin respuesta con ${JSON.stringify(payload)?.slice(0, 100)}`);
    }
  }
  return fallas;
}

describe('Payloads raros por Socket.IO: siempre { ok }, nunca se cae', () => {
  let a: Socket;
  let b: Socket;

  beforeEach(async () => {
    a = await conectar('A');
    b = await conectar('B');
  });

  afterEach(() => {
    a?.disconnect();
    b?.disconnect();
  });

  it('sin sala, con payloads raros en todos los eventos', async () => {
    const fallas: string[] = [];
    for (const ev of EVENTOS) {
      fallas.push(...(await fuzzEvento(a, ev, { code: 'ABC123', settings: { rounds: 3 }, answers: { Jugador: 'Messi' }, type: 'answer', payload: { opcion: 0 }, game: 'trivia', tematica: 'todas', size: 'pocos' })));
    }
    expect(fallas).toEqual([]);
    // Un evento sin ack ni argumentos tampoco lo rompe
    a.emit('room:join');
    a.emit('evento-que-no-existe', { x: 1 });
    expect((await emitir(a, 'queue:leave')).ok).toBe(true);
  });

  it('en el lobby de una sala (anfitrión e invitado)', async () => {
    const code = (await http().post('/rooms').set(as('A')).send({ game: 'trivia' }).expect(201)).body.code;
    expect((await emitir(a, 'room:join', { code })).ok).toBe(true);
    expect((await emitir(b, 'room:join', { code })).ok).toBe(true);
    const fallas: string[] = [];
    fallas.push(...(await fuzzEvento(a, 'room:settings', { code, settings: { tematica: 'todas', dificultad: 'facil', rounds: 5, seconds: 10 } })));
    fallas.push(...(await fuzzEvento(b, 'room:settings', { code, settings: { rounds: 5 } })));
    fallas.push(...(await fuzzEvento(b, 'room:start', { code })));
    fallas.push(...(await fuzzEvento(a, 'game:action', { code, type: 'answer', payload: { opcion: 0 } })));
    expect(fallas).toEqual([]);
  });

  // En plena partida de cada juego: las acciones con payloads raros
  const PARTIDAS: [string, Record<string, unknown>, { type: string; payload: Record<string, unknown> }[]][] = [
    ['trivia', { tematica: 'todas', dificultad: 'facil', rounds: 5, seconds: 20 }, [{ type: 'answer', payload: { opcion: 0 } }]],
    ['ahorcado', { dificultad: 'facil', rounds: 1, seconds: 60 }, [{ type: 'letter', payload: { letra: 'a' } }, { type: 'guess', payload: { respuesta: 'Messi' } }]],
    ['sopa_de_letras', { tematica: Object.keys(TEMATICAS_SOPA)[0], dificultad: 'facil', rounds: 1, seconds: 120 }, [{ type: 'mark', payload: { desde: { f: 0, c: 0 }, hasta: { f: 0, c: 3 } } }]],
    ['memotest', { tematica: Object.keys(TEMAS_MEMOTEST)[0], dificultad: 'facil', rounds: 1, seconds: 20 }, [{ type: 'flip', payload: { carta: 0 } }]],
  ];

  it.each(PARTIDAS)('jugando %s', async (game, settings, acciones) => {
    const code = (await http().post('/rooms').set(as('A')).send({ game, ...settings }).expect(201)).body.code;
    expect((await emitir(a, 'room:join', { code })).ok).toBe(true);
    expect((await emitir(b, 'room:join', { code })).ok).toBe(true);
    const jugando = esperarEstado(a, (e) => e.phase === 'playing');
    expect(await emitir(a, 'room:start', { code })).toEqual({ ok: true });
    await jugando;

    const fallas: string[] = [];
    for (const { type, payload } of acciones) {
      for (const s of [a, b]) fallas.push(...(await fuzzEvento(s, 'game:action', { code, type, payload })));
    }
    fallas.push(...(await fuzzEvento(a, 'game:action', { code, type: 'otra-cosa', payload: {} })));
    fallas.push(...(await fuzzEvento(a, 'round:answers', { code, answers: { Jugador: 'Messi' }, final: true })));
    expect(fallas).toEqual([]);
    await emitir(a, 'room:leave', { code });
    await emitir(b, 'room:leave', { code });
  });

  it('jugando Tutti Frutti: respuestas y ¡Basta! raros', async () => {
    const code = (await http().post('/rooms').set(as('A')).send({ game: 'tutti_frutti', rounds: 1, seconds: 60 }).expect(201)).body.code;
    expect((await emitir(a, 'room:join', { code })).ok).toBe(true);
    expect((await emitir(b, 'room:join', { code })).ok).toBe(true);
    const jugando = esperarEstado(a, (e) => e.phase === 'playing');
    expect(await emitir(a, 'room:start', { code })).toEqual({ ok: true });
    await jugando;

    const respuestas = { Jugador: 'Messi', Equipo: 'Millonarios', DT: 'Menotti' };
    const fallas: string[] = [];
    fallas.push(...(await fuzzEvento(a, 'round:answers', { code, answers: respuestas, final: false })));
    fallas.push(...(await fuzzEvento(b, 'round:answers', { code, answers: { Jugador: 'x'.repeat(10_000) } })));
    fallas.push(...(await fuzzEvento(b, 'round:basta', { code, answers: respuestas })));
    expect(fallas).toEqual([]);
    await emitir(a, 'room:leave', { code });
    await emitir(b, 'room:leave', { code });
  });

  // El Impostor necesita 3: se suma un usuario C. Además de los payloads raros (pista, voto y adivinar, cada
  // uno en su etapa), controla de punta a punta que la palabra nunca le llegue al impostor.
  it('jugando impostor (3 jugadores): payloads raros y la palabra nunca le llega al impostor', async () => {
    const C = { ...A, email: `c-${RUN}@correo-e2e.com.ar`, username: `c_${RUN}`.slice(0, 30), password: 'gambeta-de-potrero-C' };
    await http().post('/auth/register').send(C).expect(201);
    const tokenC = (await http().post('/auth/login').send({ email: C.email, password: C.password }).expect(201)).body.access_token;
    const c = await conectarConToken(tokenC);
    type Vista = { rol?: string; palabra?: string | null; etapa?: string | null; turno?: string | null; pistas?: unknown[]; descubierto?: string | null };
    type Estado = { phase?: string; me?: string; view?: Vista };
    const sockets = [a, b, c];
    const estados = new Map<Socket, Estado[]>(sockets.map((s) => [s, []]));
    for (const s of sockets) s.on('room:state', (e: Estado) => estados.get(s)!.push(e));
    const ultimo = (s: Socket) => estados.get(s)![estados.get(s)!.length - 1];
    const enTodos = (cond: (e: Estado) => boolean) => Promise.all(sockets.map((s) => esperarEstado(s, cond as (e: { phase?: string }) => boolean)));

    try {
      const code = (await http().post('/rooms').set(as('A')).send({ game: 'impostor', tematica: 'mezcla', rounds: 1, seconds: 20 }).expect(201)).body.code;
      for (const s of sockets) expect((await emitir(s, 'room:join', { code })).ok).toBe(true);
      const jugando = enTodos((e) => e.phase === 'playing');
      expect(await emitir(a, 'room:start', { code })).toEqual({ ok: true });
      await jugando;

      const impostor = sockets.find((s) => ultimo(s).view?.rol === 'impostor')!;
      const grupo = sockets.filter((s) => s !== impostor);
      const palabra = ultimo(grupo[0]).view!.palabra!;
      expect(palabra).toEqual(expect.any(String));
      const idDe = (s: Socket) => ultimo(s).me!;
      const socketDe = (id: string) => sockets.find((s) => idDe(s) === id)!;

      const fallas: string[] = [];
      // Pistas: la base ya es inválida (31 caracteres) para que ninguna variante avance el turno
      for (const s of sockets) fallas.push(...(await fuzzEvento(s, 'game:action', { code, type: 'pista', payload: { pista: 'x'.repeat(31) } })));
      fallas.push(...(await fuzzEvento(a, 'game:action', { code, type: 'otra-cosa', payload: {} })));
      // Dos vueltas de pistas, cada uno en su turno
      let n = 0;
      while (ultimo(a).view?.etapa === 'pistas') {
        const turno = socketDe(ultimo(a).view!.turno!);
        n++;
        const llego = enTodos((e) => (e.view?.pistas?.length ?? 0) >= n);
        // Filtro de malas palabras: una pista ofensiva se rechaza y el turno sigue siendo suyo
        expect(await emitir(turno, 'game:action', { code, type: 'pista', payload: { pista: 'p.u.t.o' } })).toEqual({ ok: false, error: 'Esa pista no está permitida.' });
        expect(await emitir(turno, 'game:action', { code, type: 'pista', payload: { pista: `pista ${n}` } })).toEqual({ ok: true });
        await llego;
      }
      expect(ultimo(a).view?.etapa).toBe('votacion');
      // Votos raros (base: alguien que no está en la sala)
      for (const s of sockets) fallas.push(...(await fuzzEvento(s, 'game:action', { code, type: 'voto', payload: { userId: UUID_AJENO } })));
      // Todos votan al impostor (y él a uno del grupo) → lo descubren
      const adivinanza = enTodos((e) => e.view?.etapa === 'adivinanza');
      for (const s of grupo) expect(await emitir(s, 'game:action', { code, type: 'voto', payload: { userId: idDe(impostor) } })).toEqual({ ok: true });
      expect(await emitir(impostor, 'game:action', { code, type: 'voto', payload: { userId: idDe(grupo[0]) } })).toEqual({ ok: true });
      await adivinanza;
      expect(ultimo(grupo[1]).view?.descubierto).toBe(idDe(impostor));
      // Adivinanzas raras: del impostor (base inválida: 61 caracteres) y del grupo (nunca puede adivinar)
      fallas.push(...(await fuzzEvento(impostor, 'game:action', { code, type: 'adivinar', payload: { respuesta: 'x'.repeat(61) } })));
      fallas.push(...(await fuzzEvento(grupo[0], 'game:action', { code, type: 'adivinar', payload: { respuesta: palabra } })));
      expect(fallas).toEqual([]);

      // Hasta acá, NINGÚN estado que recibió el impostor tuvo la palabra
      for (const e of estados.get(impostor)!) expect(JSON.stringify(e).toLowerCase()).not.toContain(palabra.toLowerCase());
      const fin = enTodos((e) => e.phase === 'finished');
      expect(await emitir(impostor, 'game:action', { code, type: 'adivinar', payload: { respuesta: 'pelotudo' } })).toEqual({ ok: false, error: 'Esa respuesta no está permitida.' });
      expect(await emitir(impostor, 'game:action', { code, type: 'adivinar', payload: { respuesta: 'zzz' } })).toEqual({ ok: true });
      await fin;
      for (const s of sockets) await emitir(s, 'room:leave', { code });
    } finally {
      c.disconnect();
    }
  });

  it('cola pública con datos raros', async () => {
    const fallas = await fuzzEvento(a, 'queue:join', { game: 'trivia', tematica: 'todas', size: 'pocos' });
    await emitir(a, 'queue:leave');
    expect(fallas).toEqual([]);
  });

  it('token raro en el handshake → no conecta, y el server sigue vivo', async () => {
    for (const token of [undefined, null, 123, { a: 1 }, ['x'], 'x'.repeat(100_000), 'a.b.c']) {
      const s = io(baseUrl, { auth: { token } as Record<string, unknown>, transports: ['websocket'], forceNew: true, reconnection: false });
      const resultado = await new Promise<string>((resolve) => {
        s.once('connect', () => resolve('conectó'));
        s.once('connect_error', () => resolve('rechazado'));
        s.once('disconnect', () => resolve('rechazado'));
      });
      s.disconnect();
      expect({ token: String(token).slice(0, 20), resultado }).toEqual({ token: String(token).slice(0, 20), resultado: 'rechazado' });
    }
    await http().get('/games').expect(200);
    expect((await emitir(a, 'queue:leave')).ok).toBe(true);
  });
});

// ─────────────────────────── 4b. Filtro de malas palabras (src/moderacion/) ───────────────────────────

describe('Filtro de malas palabras: siempre 4xx o { ok: false }, nunca 500', () => {
  const nuevo = (extra: Record<string, unknown>) => ({
    email: `f-${Math.random().toString(36).slice(2, 10)}-${RUN}@correo-e2e.com.ar`,
    password: 'gambeta-de-potrero-F',
    birthDate: '1995-05-05',
    aceptaTerminos: true,
    ...extra,
  });

  it('registro: usuario ofensivo o reservado, nombre y apellido ofensivos → 400 con el mensaje', async () => {
    for (const username of ['puto_10', 'p3l0tud0', 'puuuto', 'admin', 'soporte_clb', 'cortalabocha']) {
      const res = await http().post('/auth/register').send(nuevo({ username }));
      expect([username, res.status, res.body.errors?.username]).toEqual([username, 400, ['Ese nombre de usuario no está permitido. Elegí otro.']]);
    }
    const res = await http().post('/auth/register').send(nuevo({ name: 'Boludo', lastName: 'Mierda' })).expect(400);
    expect(res.body.errors).toEqual({ name: ['Ese nombre no está permitido. Elegí otro.'], lastName: ['Ese apellido no está permitido. Elegí otro.'] });
  });

  it('registro sin usuario: si el generado sería reservado, queda "jugador" + números', async () => {
    const res = await http().post('/auth/register').send(nuevo({ name: 'Admin' })).expect(201);
    expect(res.body.username).toMatch(/^jugador\d{4}\d*$/);
  });

  it('PUT /users/me: usuario, nombre y textos públicos ofensivos → 400; los normales pasan', async () => {
    const res = await http()
      .put('/users/me')
      .set(as('B'))
      .send({ username: 'moderador', first_name: 'Trolo', bio: 'sos un f.u.c.k', favorite_team: 'Negro villero', favorite_player: 'h1j0 d3 put4' })
      .expect(400);
    expect(res.body.errors).toEqual({
      username: ['Ese nombre de usuario no está permitido. Elegí otro.'],
      first_name: ['Ese nombre no está permitido. Elegí otro.'],
      bio: ['Ese texto no está permitido.'],
      favorite_team: ['Ese texto no está permitido.'],
      favorite_player: ['Ese texto no está permitido.'],
    });
    await http().put('/users/me').set(as('B')).send({ bio: 'Fan de la computadora y del pollo', favorite_team: 'Scunthorpe United' }).expect(200);
  });

  it('validate-round: una respuesta ofensiva no vale (sin IA) y no da 500', async () => {
    const res = await http()
      .post('/tutti-frutti/validate-round')
      .set(as('A'))
      .send({ roundLetter: 'P', answers: [{ category: 'Jugador', answer: 'P.u.t.o' }] })
      .expect(200);
    expect(res.body.results[0]).toMatchObject({ status: 'invalid', isValid: false, reason: 'Esa respuesta no está permitida.' });
  });

  it('Tutti Frutti multijugador: los demás ven "***" y el que la escribió ve la suya', async () => {
    type Celda = { userId: string; answer: string | null; status: string };
    type Estado = { phase?: string; round?: { letter: string | null; categories: string[] } | null; history?: { categories: { category: string; entries: Celda[] }[] }[] };
    const a = await conectar('A');
    const b = await conectar('B');
    try {
      const code = (await http().post('/rooms').set(as('A')).send({ game: 'tutti_frutti', rounds: 1, seconds: 30 }).expect(201)).body.code;
      expect((await emitir(a, 'room:join', { code })).ok).toBe(true);
      expect((await emitir(b, 'room:join', { code })).ok).toBe(true);
      const jugando = esperarEstado(a, (e) => e.phase === 'playing') as Promise<Estado>;
      expect(await emitir(a, 'room:start', { code })).toEqual({ ok: true });
      const { round } = await jugando;
      const respuestas = Object.fromEntries(round!.categories.map((c, i) => [c, i === 0 ? 'P.u.t.o' : `${round!.letter}algo`]));
      const finA = esperarEstado(a, (e) => e.phase === 'finished') as Promise<Estado>;
      const finB = esperarEstado(b, (e) => e.phase === 'finished') as Promise<Estado>;
      expect(await emitir(a, 'round:basta', { code, answers: respuestas })).toEqual({ ok: true });
      await emitir(b, 'round:answers', { code, answers: {}, final: true });
      const celda = (e: Estado) => e.history!.at(-1)!.categories[0].entries.find((x) => x.userId === ids.A)!;
      expect(celda(await finB)).toMatchObject({ answer: '***', status: 'invalid' });
      expect(celda(await finA)).toMatchObject({ answer: 'P.u.t.o', status: 'invalid' });
    } finally {
      a.disconnect();
      b.disconnect();
    }
  });

  it('panel de admin: lista los usuarios existentes con un nombre que no pasa el filtro (y no los cambia)', async () => {
    const prisma = app.get(PrismaService);
    const viejo = `puto_${RUN}`.slice(0, 30); // como si se hubiera registrado antes del filtro
    await prisma.users.create({ data: { username: viejo, email: `viejo-${RUN}@correo-e2e.com.ar`, password_hash: null, profile: { create: {} } } });
    const res = await http().get('/admin/nombres').set(as('A')).expect(200);
    expect(res.body.nombres).toEqual(expect.arrayContaining([expect.objectContaining({ username: viejo, motivo: 'ofensivo' })]));
    expect(res.body.nombres.find((n: { username: string }) => n.username === A.username)).toBeUndefined();
    expect(await prisma.users.findFirst({ where: { username: viejo } })).not.toBeNull();
    await http().get('/admin/nombres').set(as('B')).expect(404);
  });
});

// ───────────────────────────── Términos y Política de privacidad ─────────────────────────────

describe('Términos y Política de privacidad', () => {
  const prisma = () => app.get(PrismaService);
  const registrar = (extra: Record<string, unknown>) =>
    http().post('/auth/register').send({
      email: `t-${Math.random().toString(36).slice(2, 10)}-${RUN}@correo-e2e.com.ar`,
      password: 'gambeta-de-potrero-T',
      birthDate: '1994-04-04',
      ...extra,
    });

  it('el registro sin aceptar (sin el campo, false o texto) → 400 con el mensaje y no crea la cuenta', async () => {
    for (const extra of [{}, { aceptaTerminos: false }, { aceptaTerminos: 'true' }]) {
      const email = `sin-${Math.random().toString(36).slice(2, 10)}-${RUN}@correo-e2e.com.ar`;
      const res = await registrar({ ...extra, email }).expect(400);
      expect(res.body.errors.aceptaTerminos).toEqual(['Tenés que aceptar los Términos y la Política de privacidad.']);
      expect(await prisma().users.count({ where: { email } })).toBe(0);
    }
  });

  it('el registro guarda la fecha (del servidor) y la versión; /users/me no los tiene pendientes', async () => {
    const antes = Date.now();
    const reg = await registrar({ aceptaTerminos: true }).expect(201);
    const fila = await prisma().users.findUnique({ where: { id: reg.body.userId }, select: { terms_accepted_at: true, terms_version: true } });
    expect(fila!.terms_version).toBe(TERMS_VERSION);
    expect(fila!.terms_accepted_at!.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    const yo = await http().get('/users/me').set(as('A')).expect(200);
    expect(yo.body.terminosPendientes).toBe(false);
    expect(yo.body).not.toHaveProperty('terms_version');
  });

  it('un usuario de antes (o de Google) queda pendiente hasta aceptar la versión vigente; sólo acepta por sí mismo', async () => {
    // Como los usuarios que ya existían: sin versión aceptada
    await prisma().users.update({ where: { id: ids.B }, data: { terms_version: null, terms_accepted_at: null } });
    expect((await http().get('/users/me').set(as('B')).expect(200)).body.terminosPendientes).toBe(true);

    // Versión vieja o rara → 400 y sigue pendiente
    await http().post('/users/me/aceptar-terminos').set(as('B')).send({ version: '2020-01-01' }).expect(400);
    await http().post('/users/me/aceptar-terminos').set(as('B')).send({}).expect(400);
    // Sin sesión → 401
    await http().post('/users/me/aceptar-terminos').send({ version: TERMS_VERSION }).expect(401);
    expect((await http().get('/users/me').set(as('B')).expect(200)).body.terminosPendientes).toBe(true);

    // A acepta: B sigue pendiente (no hay forma de aceptar por otro)
    await http().post('/users/me/aceptar-terminos').set(as('A')).send({ version: TERMS_VERSION, userId: ids.B }).expect(200);
    expect((await http().get('/users/me').set(as('B')).expect(200)).body.terminosPendientes).toBe(true);

    const res = await http().post('/users/me/aceptar-terminos').set(as('B')).send({ version: TERMS_VERSION }).expect(200);
    expect(res.body).toMatchObject({ terminosPendientes: false, version: TERMS_VERSION });
    expect((await http().get('/users/me').set(as('B')).expect(200)).body.terminosPendientes).toBe(false);
  });
});

// ─────────────────────────────── 5. Row Level Security ───────────────────────────────
// La migración 20261014120000_rls_todas_las_tablas activa RLS sin políticas. La app sigue andando porque Prisma
// entra como DUEÑO de las tablas (el dueño no está sujeto a RLS). Para que la prueba valga, en el CI (y con
// E2E_SIN_SUPERUSUARIO=1 en local) la app corre con un usuario que NO es superusuario ni tiene BYPASSRLS:
// si RLS la frenara, fallarían todos los tests de arriba. E2E_ROL_ANON = un rol tipo "anon" de Supabase.

describe('Row Level Security', () => {
  const prisma = () => app.get(PrismaService);

  it('todas las tablas de public tienen RLS activado', async () => {
    const sinRls = await prisma().$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity ORDER BY 1`;
    expect(sinRls.map((t) => t.tablename)).toEqual([]);
  });

  const conUsuarioComun = process.env.E2E_SIN_SUPERUSUARIO === '1' ? it : it.skip;
  conUsuarioComun('la app corre con un usuario que NO se saltea RLS por ser superusuario, y es dueño de las tablas', async () => {
    const [yo] = await prisma().$queryRaw<{ usuario: string; superusuario: boolean; bypassrls: boolean }[]>`
      SELECT current_user AS usuario, rolsuper AS superusuario, rolbypassrls AS bypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(yo).toMatchObject({ superusuario: false, bypassrls: false });
    const ajenas = await prisma().$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner <> current_user`;
    expect(ajenas).toEqual([]);
  });

  const rolAnon = process.env.E2E_ROL_ANON;
  (rolAnon ? it : it.skip)('un rol que no es dueño (como "anon" de Supabase) no ve ni puede crear filas', async () => {
    const comoDueño = await prisma().users.count();
    expect(comoDueño).toBeGreaterThan(0);
    const comoAnon = await prisma().$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${rolAnon}"`);
      return tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM users`;
    });
    expect(Number(comoAnon[0].n)).toBe(0);
    await expect(
      prisma().$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${rolAnon}"`);
        await tx.$executeRaw`INSERT INTO categories (id, name) VALUES (gen_random_uuid(), 'hackeada')`;
      }),
    ).rejects.toThrow(/row-level security/);
  });
});
