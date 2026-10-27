import { COUNTDOWN_MS, GameEngine, type RoomSnapshot, type RoomStore, type StoredPlayer } from '../game-engine';
import { Matchmaking, QUEUE_WAIT_MS } from '../matchmaking';
import { MODES } from '.';
import { BANCO } from '../../ahorcado/ahorcado-bank';
import { elegirPreguntas, prepararPregunta } from '../../trivia/trivia-rules';
import { armarMazo } from '../../memotest/memotest-rules';
import { BONUS_PRIMERO } from './trivia.mode';
import { BONUS_ORDEN } from './ahorcado.mode';
import { MOSTRAR_MS, PUNTOS_PAR } from './memotest.mode';
import { puntosPalabra } from './sopa.mode';
import type { MultiGameId, Settings } from './types';

// Multijugador de los juegos nuevos (ahorcado, trivia, sopa de letras y memotest) con el motor real
// y una base falsa en memoria. La IA no se usa en estos juegos.

function fakeStore() {
  let n = 0;
  const players = new Map<string, StoredPlayer[]>();
  const rooms = new Map<string, { roomId: string; game: MultiGameId }>();
  const sp = (userId: string): StoredPlayer => ({
    userId,
    username: userId.toUpperCase(),
    avatarId: null,
    roomPlayerId: `rp-${userId}`,
    joinedAt: new Date(Date.now() + n++),
  });
  return {
    createRoom: jest.fn(async (isPrivate: boolean, userIds: string[], game: MultiGameId = 'tutti_frutti') => {
      const roomId = `room${++n}`;
      const code = `C${n}`;
      rooms.set(code, { roomId, game });
      players.set(roomId, userIds.map(sp));
      return { roomId, code, isPrivate, status: 'waiting', game, players: players.get(roomId)! };
    }),
    loadRoom: jest.fn(async (code: string) => {
      const r = rooms.get(code);
      return r ? { roomId: r.roomId, code, isPrivate: true, status: 'waiting', game: r.game, players: players.get(r.roomId)! } : null;
    }),
    addPlayer: jest.fn(async (roomId: string, userId: string) => {
      const p = sp(userId);
      players.get(roomId)!.push(p);
      return p;
    }),
    removePlayer: jest.fn(async () => undefined),
    setRoomStatus: jest.fn(async () => undefined),
    createMatch: jest.fn(async () => 'match1'),
    createRound: jest.fn(async () => 'round1'),
    saveRound: jest.fn(async () => undefined),
    finishMatch: jest.fn(async () => ({})),
  } satisfies RoomStore;
}

function setup() {
  const store = fakeStore();
  const validator = { validateAnswers: jest.fn() };
  const last = new Map<string, RoomSnapshot>();
  const engine = new GameEngine(store, validator, { sendState: (u, s) => last.set(u, s) });
  return { engine, store, validator, state: (u: string) => last.get(u)! };
}
type S = ReturnType<typeof setup>;

const tick = (ms: number) => jest.advanceTimersByTimeAsync(ms);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const view = (s: S, u: string) => s.state(u).view as any;

async function sala(s: S, game: MultiGameId, settings: Partial<Settings>, users = ['a', 'b']) {
  const res = await s.engine.createPrivateRoom(users[0], settings, game);
  if (!res.ok) throw new Error(res.error);
  for (const u of users) await s.engine.join(res.code!, { userId: u });
  return res.code!;
}

async function arrancar(s: S, code: string) {
  expect(await s.engine.start(code, 'a')).toEqual({ ok: true });
  expect(s.state('a').phase).toBe('countdown');
  await tick(COUNTDOWN_MS);
  expect(s.state('a').phase).toBe('playing');
}

// Generador con semilla: para saber qué mazo / grilla armó el servidor y poder jugar en el test
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('salas de cada juego', () => {
  it('cada juego valida sus opciones y la sala recuerda de qué juego es', async () => {
    const s = setup();
    expect(await s.engine.createPrivateRoom('a', { dificultad: 'imposible' }, 'ahorcado')).toMatchObject({ ok: false });
    expect(await s.engine.createPrivateRoom('a', { rounds: 7 }, 'trivia')).toMatchObject({ ok: false });
    const code = await sala(s, 'sopa_de_letras', { tematica: 'estadios', dificultad: 'dificil', rounds: 2, seconds: 300 });
    expect(s.state('b')).toMatchObject({ game: 'sopa_de_letras', settings: { tematica: 'estadios', dificultad: 'dificil', rounds: 2, seconds: 300 } });
    expect(await s.engine.updateSettings(code, 'a', { seconds: 60 })).toMatchObject({ ok: false }); // 60 s no es opción de la sopa
    expect(await s.engine.updateSettings(code, 'a', { dificultad: 'facil' })).toEqual({ ok: true });
    expect(s.state('b').settings.dificultad).toBe('facil');
    expect(s.store.createRoom).toHaveBeenCalledWith(true, ['a'], 'sopa_de_letras');
  });

  it('el memotest es de hasta 4 jugadores', async () => {
    const s = setup();
    const code = await sala(s, 'memotest', {}, ['a', 'b', 'c', 'd']);
    expect(s.state('a').maxPlayers).toBe(4);
    expect(await s.engine.join(code, { userId: 'e' })).toMatchObject({ ok: false, error: 'La sala está llena.' });
  });

  it('la trivia no arranca si con ese filtro no alcanzan las preguntas', async () => {
    const s = setup();
    const code = await sala(s, 'trivia', { tematica: 'Reglamento', dificultad: 'dificil', rounds: 15 });
    expect(await s.engine.start(code, 'a')).toMatchObject({ ok: false, error: expect.stringContaining('preguntas') });
  });

  it('una acción de otro juego o fuera de la partida da error (nunca rompe)', async () => {
    const s = setup();
    const code = await sala(s, 'trivia', { rounds: 5 });
    expect(await s.engine.action(code, 'a', 'answer', { opcion: 1 })).toMatchObject({ ok: false });
    await arrancar(s, code);
    expect(await s.engine.action(code, 'a', 'flip', { carta: 0 })).toMatchObject({ ok: false });
    expect(await s.engine.action(code, 'zz', 'answer', { opcion: 0 })).toMatchObject({ ok: false, error: 'No estás en esta partida.' });
  });
});

describe('trivia multijugador', () => {
  function preguntas(n: number) {
    // Con Math.random = 0 el servidor elige y mezcla siempre igual
    return elegirPreguntas(() => 0, {}, n).map((p) => prepararPregunta(p, () => 0));
  }

  it('todos reciben la misma pregunta; la correcta recién viaja al revelarla', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const s = setup();
    const code = await sala(s, 'trivia', { rounds: 5, seconds: 20 });
    await arrancar(s, code);
    const [p1] = preguntas(5);
    expect(view(s, 'a').pregunta).toEqual(view(s, 'b').pregunta);
    expect(view(s, 'a').pregunta.opciones).toEqual(p1.opciones);
    expect(JSON.stringify(s.state('a'))).not.toContain('correcta":' + p1.correcta);
    expect(view(s, 'a').revelada).toBeNull();
  });

  it('suma más quien acierta más rápido (+ bonus al primero); con todos respondidos se revela enseguida', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const s = setup();
    const code = await sala(s, 'trivia', { rounds: 5, seconds: 20 }, ['a', 'b', 'c']);
    await arrancar(s, code);
    const [p1] = preguntas(5);
    const mal = (p1.correcta + 1) % 4;
    await tick(2000);
    expect(await s.engine.action(code, 'b', 'answer', { opcion: p1.correcta })).toEqual({ ok: true });
    expect(await s.engine.action(code, 'b', 'answer', { opcion: mal })).toMatchObject({ ok: false, error: 'Ya respondiste esta pregunta.' });
    expect(view(s, 'a').respondieron).toEqual(['b']); // se ve quién respondió, no qué
    expect(view(s, 'a').revelada).toBeNull();
    await tick(6000);
    await s.engine.action(code, 'a', 'answer', { opcion: p1.correcta });
    await s.engine.action(code, 'c', 'answer', { opcion: mal });
    const st = s.state('a');
    expect(st.phase).toBe('results'); // respondieron todos: no espera el reloj
    const r = view(s, 'a').revelada;
    expect(r.correcta).toBe(p1.correcta);
    const pts = (u: string) => r.resultados.find((x: { userId: string }) => x.userId === u).puntos;
    expect(pts('b')).toBeGreaterThan(pts('a'));
    expect(pts('c')).toBe(0);
    expect(st.players.find((p) => p.userId === 'b')!.score).toBe(pts('b'));
    expect(pts('b') - BONUS_PRIMERO).toBeGreaterThanOrEqual(pts('a'));
  });

  it('si se acaba el tiempo, cuenta como sin responder; al final, estadísticas una sola vez con los aciertos para los logros', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const s = setup();
    const code = await sala(s, 'trivia', { rounds: 5, seconds: 10 });
    await arrancar(s, code);
    const ps = preguntas(5);
    for (let i = 0; i < 5; i++) {
      expect(view(s, 'a').numero).toBe(i + 1);
      await s.engine.action(code, 'a', 'answer', { opcion: ps[i].correcta });
      await tick(11_000); // b no responde: se corta por tiempo
      if (i < 4) {
        expect(s.state('a').phase).toBe('results');
        await tick(4_000);
        expect(s.state('a').phase).toBe('playing'); // sin cuenta regresiva entre preguntas
      }
    }
    const st = s.state('a');
    expect(st.phase).toBe('finished');
    expect(st.final!.standings[0]).toMatchObject({ userId: 'a', won: true });
    expect(st.final!.standings[1]).toMatchObject({ userId: 'b', won: false, points: 0 });
    expect(s.store.finishMatch).toHaveBeenCalledTimes(1);
    const [, , results, counts, game] = s.store.finishMatch.mock.calls[0] as unknown as [string, string, { userId: string; extra?: object }[], boolean, string];
    expect([counts, game]).toEqual([true, 'trivia']);
    expect(results.find((x) => x.userId === 'a')!.extra).toMatchObject({ aciertos: 5, total: 5 });
  });
});

describe('ahorcado multijugador', () => {
  it('misma palabra para todos, cada uno con sus letras; de los rivales sólo errores y avance', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const s = setup();
    const code = await sala(s, 'ahorcado', { dificultad: 'medio', rounds: 1, seconds: 60 });
    await arrancar(s, code);
    expect(view(s, 'a').pista).toBe(BANCO.medio[0].pista);
    expect(JSON.stringify(s.state('a'))).not.toContain('MESSI');
    await s.engine.action(code, 'a', 'letter', { letra: 'e' });
    await s.engine.action(code, 'b', 'letter', { letra: 'z' });
    expect(BANCO.medio[0].texto).toBe('Lionel Messi');
    expect(view(s, 'a').yo.mascara.join('')).toBe('____E_ _E___');
    expect(view(s, 'b').yo.mascara.join('')).toBe('______ _____');
    expect(view(s, 'b').yo.errores).toBe(1);
    const rivalDeB = view(s, 'b').rivales[0];
    expect(rivalDeB).toMatchObject({ userId: 'a', errores: 0, estado: 'jugando' });
    expect(rivalDeB.avance).toBeGreaterThan(0);
    expect(JSON.stringify(view(s, 'b'))).not.toContain('"E"'); // las letras de a no le llegan a b
    expect(await s.engine.action(code, 'a', 'letter', { letra: 'E' })).toMatchObject({ ok: false, error: 'Esa letra ya la probaste.' });
  });

  it('suma quien la completa (el primero con bonus); con 6 errores muere su redonda; al terminar todos, se revela', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const s = setup();
    const code = await sala(s, 'ahorcado', { dificultad: 'medio', rounds: 3, seconds: 90 }, ['a', 'b', 'c']);
    await arrancar(s, code);
    expect(await s.engine.action(code, 'a', 'guess', { respuesta: 'lionel messi' })).toEqual({ ok: true });
    expect(view(s, 'a').yo.estado).toBe('completo');
    expect(await s.engine.action(code, 'a', 'letter', { letra: 'x' })).toMatchObject({ ok: false });
    await tick(5000);
    for (const l of 'LIONEMS') await s.engine.action(code, 'b', 'letter', { letra: l });
    for (const l of 'ZXWQJK') await s.engine.action(code, 'c', 'letter', { letra: l });
    expect(s.state('a').phase).toBe('results');
    const r = view(s, 'a').revelada;
    expect(r.respuesta).toBe('Lionel Messi');
    const pts = (u: string) => r.resultados.find((x: { userId: string }) => x.userId === u).puntos;
    expect(pts('a') - pts('b')).toBeGreaterThanOrEqual(BONUS_ORDEN[0] - BONUS_ORDEN[1]);
    expect(r.resultados.find((x: { userId: string }) => x.userId === 'c')).toMatchObject({ estado: 'muerto', puntos: 0 });
    // Siguiente palabra (otra)
    await tick(8000 + COUNTDOWN_MS);
    expect(s.state('a').phase).toBe('playing');
    expect(view(s, 'a').numero).toBe(2);
    expect(view(s, 'a').yo.mascara.join('')).not.toBe('______ _____');
  });

  it('si alguien recarga, vuelve con sus letras; si alguien abandona, los demás se enteran', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const s = setup();
    const code = await sala(s, 'ahorcado', { rounds: 3 }, ['a', 'b', 'c']);
    await arrancar(s, code);
    await s.engine.action(code, 'b', 'letter', { letra: 'S' });
    await s.engine.disconnect(code, 'b');
    expect(await s.engine.join(code, { userId: 'b' })).toEqual({ ok: true, code });
    expect(view(s, 'b').yo.adivinadas).toEqual(['S']);
    await s.engine.leave(code, 'c');
    expect(s.state('a').notice).toBe('C abandonó la partida.');
    expect(s.state('a').players.find((p) => p.userId === 'c')!.left).toBe(true);
  });
});

describe('sopa de letras multijugador', () => {
  // Busca una palabra en la grilla (en las 8 direcciones): lo que haría un jugador
  function buscar(grilla: string[], palabra: string) {
    const n = grilla.length;
    for (let f = 0; f < n; f++)
      for (let c = 0; c < n; c++)
        for (const [df, dc] of [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]]) {
          let ok = true;
          for (let i = 0; i < palabra.length && ok; i++) {
            const ff = f + df * i;
            const cc = c + dc * i;
            ok = ff >= 0 && cc >= 0 && ff < n && cc < n && grilla[ff][cc] === palabra[i];
          }
          if (ok) return { desde: { f, c }, hasta: { f: f + df * (palabra.length - 1), c: c + dc * (palabra.length - 1) } };
        }
    throw new Error(`no encontré ${palabra}`);
  }

  it('misma grilla para todos; cada palabra es del primero que la encuentra; sin posiciones de las que faltan', async () => {
    const s = setup();
    const code = await sala(s, 'sopa_de_letras', { tematica: 'jugadores', dificultad: 'facil', rounds: 1, seconds: 180 });
    await arrancar(s, code);
    const v = view(s, 'a');
    expect(v.grilla).toEqual(view(s, 'b').grilla);
    expect(v.encontradas).toEqual([]);
    expect(JSON.stringify(v)).not.toContain('celdas');
    const [p1, ...resto] = v.palabras as string[];
    const linea = buscar(v.grilla, p1);
    expect(await s.engine.action(code, 'b', 'mark', linea)).toEqual({ ok: true });
    expect(await s.engine.action(code, 'a', 'mark', linea)).toMatchObject({ ok: false, error: `Esa ya la encontró B.` });
    expect(view(s, 'a').encontradas).toEqual([expect.objectContaining({ palabra: p1, userId: 'b' })]);
    expect(s.state('a').players.find((p) => p.userId === 'b')!.score).toBe(puntosPalabra(p1, 'facil'));
    expect(await s.engine.action(code, 'a', 'mark', { desde: { f: 0, c: 0 }, hasta: { f: 1, c: 3 } })).toMatchObject({ ok: false, error: 'Marcá en línea recta.' });
    // a encuentra todas las demás: la ronda (y la partida, de 1 grilla) termina
    for (const p of resto) await s.engine.action(code, 'a', 'mark', buscar(v.grilla, p));
    const st = s.state('a');
    expect(st.phase).toBe('finished');
    expect(st.final!.standings[0]).toMatchObject({ userId: 'a', won: true });
    expect(s.store.finishMatch).toHaveBeenCalledWith('match1', expect.any(String), expect.any(Array), true, 'sopa_de_letras');
  });

  it('si se acaba el tiempo, se muestran todas (las que nadie encontró, sin dueño)', async () => {
    const s = setup();
    const code = await sala(s, 'sopa_de_letras', { dificultad: 'facil', rounds: 2, seconds: 120 });
    await arrancar(s, code);
    await tick(121_000);
    expect(s.state('a').phase).toBe('results');
    const todas = view(s, 'a').revelada.todas;
    expect(todas.length).toBeGreaterThan(0);
    expect(todas.every((w: { userId: string | null }) => w.userId === null)).toBe(true);
  });
});

describe('memotest multijugador', () => {
  async function partida(users = ['a', 'b']) {
    const seed = rng(42);
    jest.spyOn(Math, 'random').mockImplementation(seed);
    const s = setup();
    const code = await sala(s, 'memotest', { tematica: 'clubes_apodos', dificultad: 'facil', rounds: 1, seconds: 15 }, users);
    await arrancar(s, code);
    const mazo = armarMazo('clubes_apodos', 'facil', rng(42)); // el mismo que armó el servidor
    const parDe = (i: number) => mazo.findIndex((c, j) => j !== i && c.par === mazo[i].par);
    return { s, code, mazo, parDe };
  }

  it('por turnos: sólo juega el que tiene el turno; el mazo nunca viaja entero', async () => {
    const { s, code } = await partida();
    const v = view(s, 'a');
    expect(v.cartas).toBe(12);
    expect(v.turno).toBe('a');
    expect(v.descubiertas).toEqual([]);
    expect(JSON.stringify(s.state('b'))).not.toContain('Xeneize');
    expect(await s.engine.action(code, 'b', 'flip', { carta: 0 })).toMatchObject({ ok: false, error: 'No es tu turno.' });
    expect(await s.engine.action(code, 'a', 'flip', { carta: 0 })).toEqual({ ok: true });
    expect(view(s, 'b').abiertas).toEqual([expect.objectContaining({ indice: 0 })]); // todos ven la carta dada vuelta
    expect(await s.engine.action(code, 'a', 'flip', { carta: 0 })).toMatchObject({ ok: false, error: 'Esa carta ya está dada vuelta.' });
  });

  it('si acertás un par, seguís jugando; si no, se ven un momento y pasa el turno', async () => {
    const { s, code, parDe } = await partida();
    await s.engine.action(code, 'a', 'flip', { carta: 0 });
    await s.engine.action(code, 'a', 'flip', { carta: parDe(0) });
    expect(view(s, 'b').descubiertas).toHaveLength(2);
    expect(view(s, 'b').turno).toBe('a');
    expect(s.state('b').players.find((p) => p.userId === 'a')!.score).toBe(PUNTOS_PAR);
    const libre = [...Array(12).keys()].find((i) => i !== 0 && i !== parDe(0))!;
    const otra = [...Array(12).keys()].find((i) => ![0, parDe(0), libre, parDe(libre)].includes(i))!;
    await s.engine.action(code, 'a', 'flip', { carta: libre });
    await s.engine.action(code, 'a', 'flip', { carta: otra });
    expect(view(s, 'b')).toMatchObject({ mostrando: true, turno: 'a' });
    expect(view(s, 'b').abiertas).toHaveLength(2);
    expect(await s.engine.action(code, 'a', 'flip', { carta: 5 })).toMatchObject({ ok: false });
    await tick(MOSTRAR_MS);
    expect(view(s, 'b')).toMatchObject({ mostrando: false, turno: 'b', abiertas: [] });
  });

  it('si se te acaba el tiempo o abandonás en tu turno, pasa al siguiente', async () => {
    const { s, code } = await partida(['a', 'b', 'c']);
    await tick(15_500);
    expect(view(s, 'a').turno).toBe('b');
    await s.engine.leave(code, 'b');
    expect(view(s, 'a').turno).toBe('c');
  });

  it('gana quien junta más pares; estadísticas una sola vez', async () => {
    const { s, code, mazo, parDe } = await partida();
    const hechos = new Set<number>();
    for (let i = 0; i < mazo.length; i++) {
      if (hechos.has(i)) continue;
      const j = parDe(i);
      hechos.add(i).add(j);
      await s.engine.action(code, 'a', 'flip', { carta: i });
      await s.engine.action(code, 'a', 'flip', { carta: j });
    }
    const st = s.state('b');
    expect(st.phase).toBe('finished');
    expect(st.final!.standings[0]).toMatchObject({ userId: 'a', points: 6 * PUNTOS_PAR, won: true });
    expect(s.store.finishMatch).toHaveBeenCalledTimes(1);
    expect(s.store.finishMatch).toHaveBeenCalledWith('match1', expect.any(String), expect.any(Array), true, 'memotest');
  });
});

describe('cola pública por juego', () => {
  it('junta a los del mismo juego y arma la sala con la configuración pública de ese juego', async () => {
    const s = setup();
    const matched: Record<string, string> = {};
    const queue = new Matchmaking((ids, settings, game) => s.engine.createQueueRoom(ids, settings, game), {
      sendQueueState: () => undefined,
      sendMatched: (u, code) => (matched[u] = code),
    });
    expect(queue.join({ userId: 'a', username: 'A' }, '', 'pocos', 'trivia')).toEqual({ ok: true });
    expect(queue.join({ userId: 'z', username: 'Z' }, 'general', 'pocos', 'tutti_frutti')).toEqual({ ok: true });
    expect(queue.join({ userId: 'b', username: 'B' }, 'cualquiera', 'pocos', 'trivia')).toEqual({ ok: true });
    expect(queue.join({ userId: 'x', username: 'X' }, '', 'muchos', 'memotest')).toMatchObject({ ok: false }); // memotest: hasta 4
    expect(queue.join({ userId: 'x', username: 'X' }, '', 'pocos', 'truco')).toMatchObject({ ok: false });
    await tick(QUEUE_WAIT_MS);
    expect(matched.a).toBeDefined();
    expect(matched.b).toBe(matched.a);
    expect(matched.z).toBeUndefined();
    await s.engine.join(matched.a, { userId: 'a' });
    await s.engine.join(matched.a, { userId: 'b' });
    expect(s.state('a')).toMatchObject({ game: 'trivia', phase: 'countdown', settings: MODES.trivia.publicSettings('') });
  });
});

// ── El Impostor ─────────────────────────────────────────────────────────────────────────────
describe('El Impostor multijugador', () => {
  const TRES = ['a', 'b', 'c'];

  async function partida(settings: Partial<Settings> = {}, users = TRES) {
    const s = setup();
    const code = await sala(s, 'impostor', { rounds: 1, seconds: 20, ...settings }, users);
    await arrancar(s, code);
    const impostor = users.find((u) => view(s, u).rol === 'impostor')!;
    const grupo = users.filter((u) => u !== impostor);
    const palabra: string = view(s, grupo[0]).palabra;
    return { s, code, impostor, grupo, palabra, users };
  }

  // Todos dan su pista en su turno (las dos vueltas) hasta que arranca la votación
  async function darPistas(s: S, code: string, users: string[]) {
    let i = 0;
    while (view(s, users[0]).etapa === 'pistas') {
      const turno = view(s, users[0]).turno;
      expect(await s.engine.action(code, turno, 'pista', { pista: `pista ${++i}` })).toEqual({ ok: true });
    }
    expect(view(s, users[0]).etapa).toBe('votacion');
  }

  // Lo que ve cada uno sin lo propio (su voto)
  const publico = (s: S, u: string) => {
    const { miVoto: _miVoto, ...resto } = view(s, u);
    return resto;
  };

  // La palabra no aparece en NINGUNA parte del estado que recibe el impostor
  const noLaVe = (s: S, impostor: string, palabra: string) =>
    expect(JSON.stringify(s.state(impostor)).toLowerCase()).not.toContain(palabra.toLowerCase());

  it('es de 3 a 8 jugadores: con 2 no arranca', async () => {
    const s = setup();
    const code = await sala(s, 'impostor', {}, ['a', 'b']);
    expect(s.state('a')).toMatchObject({ minPlayers: 3, maxPlayers: 8 });
    expect(await s.engine.start(code, 'a')).toMatchObject({ ok: false, error: 'Hacen falta al menos 3 jugadores conectados.' });
    await s.engine.join(code, { userId: 'c' });
    expect(await s.engine.start(code, 'a')).toEqual({ ok: true });
  });

  it('valida las opciones de la sala', async () => {
    const s = setup();
    for (const mala of [{ tematica: 'clubes' }, { rounds: 2 }, { seconds: 60 }]) {
      expect(await s.engine.createPrivateRoom('a', mala, 'impostor')).toMatchObject({ ok: false });
    }
    const code = await sala(s, 'impostor', { tematica: 'dt', rounds: 5, seconds: 45 }, TRES);
    expect(s.state('b').settings).toEqual({ tematica: 'dt', rounds: 5, seconds: 45 });
    expect(await s.engine.updateSettings(code, 'a', { tematica: 'mezcla' })).toEqual({ ok: true });
  });

  it('la palabra NUNCA le llega al impostor y nadie sabe quién es hasta que se cierra la votación', async () => {
    const s = setup();
    const users = ['a', 'b', 'c', 'd'];
    const code = await sala(s, 'impostor', { rounds: 1, seconds: 20 }, users);
    expect(await s.engine.start(code, 'a')).toEqual({ ok: true });
    // Cuenta regresiva: nadie sabe nada todavía
    for (const u of users) expect(view(s, u)).toMatchObject({ rol: null, palabra: null, categoria: null });
    await tick(COUNTDOWN_MS);

    const impostor = users.find((u) => view(s, u).rol === 'impostor')!;
    const grupo = users.filter((u) => u !== impostor);
    const palabra: string = view(s, grupo[0]).palabra;
    expect(users.filter((u) => view(s, u).rol === 'impostor')).toHaveLength(1);
    expect(view(s, impostor)).toMatchObject({ rol: 'impostor', palabra: null, categoria: expect.any(String) });
    for (const u of grupo) expect(view(s, u)).toMatchObject({ rol: 'grupo', palabra, categoria: view(s, impostor).categoria });

    const controlar = () => {
      noLaVe(s, impostor, palabra);
      // Los del grupo ven exactamente lo mismo: nada los distingue entre sí
      for (const u of grupo.slice(1)) expect(publico(s, u)).toEqual(publico(s, grupo[0]));
      // Y lo público del impostor es igual al del grupo (salvo su rol y la palabra)
      const { rol: _r, palabra: _p, ...delImpostor } = publico(s, impostor);
      const { rol: _r2, palabra: _p2, ...delGrupo } = publico(s, grupo[0]);
      expect(delImpostor).toEqual(delGrupo);
      for (const u of users) expect(view(s, u)).toMatchObject({ descubierto: null, revelada: null });
    };
    controlar();
    // Pistas (dos vueltas de 4)
    let i = 0;
    while (view(s, 'a').etapa === 'pistas') {
      await s.engine.action(code, view(s, 'a').turno, 'pista', { pista: `pista ${++i}` });
      controlar();
    }
    expect(i).toBe(8);
    // Votación: se ve quién votó, nunca a quién
    await s.engine.action(code, grupo[0], 'voto', { userId: impostor });
    await s.engine.action(code, impostor, 'voto', { userId: grupo[0] });
    controlar();
    expect([...view(s, grupo[1]).votaron].sort()).toEqual([grupo[0], impostor].sort());
    expect(view(s, grupo[1]).miVoto).toBeNull();
    expect(view(s, grupo[0]).miVoto).toBe(impostor);
    // Votan los que faltan → lo descubren: ahí sí todos saben quién es (la palabra sigue sin llegarle)
    await s.engine.action(code, grupo[1], 'voto', { userId: impostor });
    await s.engine.action(code, grupo[2], 'voto', { userId: impostor }); // 3 a 1: lo descubren
    for (const u of users) expect(view(s, u)).toMatchObject({ etapa: 'adivinanza', descubierto: impostor });
    noLaVe(s, impostor, palabra);
    // Recién al terminar la ronda viaja la palabra (a todos)
    await s.engine.action(code, impostor, 'adivinar', { respuesta: 'cualquier cosa' });
    expect(s.state(impostor).phase).toBe('finished');
    expect(view(s, impostor).revelada).toMatchObject({ palabra, impostor });
  });

  it('pistas por turnos: sólo el del turno, hasta 30 caracteres, sin la palabra; si se acaba el tiempo pasa sin pista', async () => {
    const { s, code, impostor, palabra } = await partida();
    const turno: string = view(s, 'a').turno;
    const otro = TRES.find((u) => u !== turno)!;
    expect(await s.engine.action(code, otro, 'pista', { pista: 'hola' })).toMatchObject({ ok: false, error: 'No es tu turno.' });
    expect(await s.engine.action(code, turno, 'pista', { pista: 'x'.repeat(31) })).toMatchObject({ ok: false });
    for (const raro of [null, undefined, 42, 'texto', [], {}, { pista: null }, { pista: 5 }, { pista: { a: 1 } }, { pista: ['a'] }, { pista: '   ' }]) {
      expect(await s.engine.action(code, turno, 'pista', raro)).toMatchObject({ ok: false });
    }
    // Al grupo no se le acepta una pista con la palabra (aunque cambie mayúsculas)
    if (turno !== impostor) {
      expect(await s.engine.action(code, turno, 'pista', { pista: `es ${palabra.toUpperCase()}` })).toMatchObject({
        ok: false,
        error: 'Tu pista no puede tener la palabra secreta.',
      });
    }
    expect(await s.engine.action(code, turno, 'pista', { pista: 'x'.repeat(30) })).toEqual({ ok: true });
    expect(view(s, 'a').pistas).toEqual([{ userId: turno, vuelta: 1, texto: 'x'.repeat(30) }]);
    // El siguiente no escribe: pasa sin pista
    const siguiente: string = view(s, 'a').turno;
    expect(siguiente).not.toBe(turno);
    await tick(20_000 + 600);
    expect(view(s, 'a').pistas[1]).toEqual({ userId: siguiente, vuelta: 1, texto: null });
    expect(view(s, 'a').turno).not.toBe(siguiente);
  });

  it('al impostor no se le revisa la pista (si se la rechazáramos, sabría que adivinó)', async () => {
    const { s, code, impostor, grupo, palabra } = await partida();
    // Pasan los turnos hasta que le toca al impostor
    while (view(s, 'a').turno !== impostor) await s.engine.action(code, view(s, 'a').turno, 'pista', { pista: 'algo' });
    expect(await s.engine.action(code, impostor, 'pista', { pista: palabra.slice(0, 30) })).toEqual({ ok: true });
    expect(grupo).toHaveLength(2);
  });

  it('pista o adivinanza ofensiva: rechazada (a todos, también al impostor) y no gasta el turno ni el intento', async () => {
    const { s, code, impostor, grupo } = await partida();
    for (const mala of ['puto', 'P.E.L.O.T.U.D.O', 'm13rd4', 'la concha de tu madre']) {
      const turno: string = view(s, 'a').turno;
      expect(await s.engine.action(code, turno, 'pista', { pista: mala })).toEqual({ ok: false, error: 'Esa pista no está permitida.' });
      expect(view(s, 'a').turno).toBe(turno);
    }
    expect(view(s, 'a').pistas).toEqual([]);
    while (view(s, 'a').turno !== impostor) await s.engine.action(code, view(s, 'a').turno, 'pista', { pista: 'algo' });
    expect(await s.engine.action(code, impostor, 'pista', { pista: 'boludo' })).toEqual({ ok: false, error: 'Esa pista no está permitida.' });
    // Lo descubren: la adivinanza ofensiva tampoco vale, pero puede volver a intentar
    await darPistas(s, code, TRES);
    for (const u of grupo) await s.engine.action(code, u, 'voto', { userId: impostor });
    await s.engine.action(code, impostor, 'voto', { userId: grupo[0] });
    expect(view(s, impostor).etapa).toBe('adivinanza');
    expect(await s.engine.action(code, impostor, 'adivinar', { respuesta: 'puuuto' })).toEqual({ ok: false, error: 'Esa respuesta no está permitida.' });
    expect(view(s, impostor).etapa).toBe('adivinanza');
    expect(await s.engine.action(code, impostor, 'adivinar', { respuesta: 'cualquiera' })).toEqual({ ok: true });
  });

  it('si abandona el del turno, pasa al siguiente; si abandona el impostor, ganan los demás', async () => {
    const { s, code, impostor, grupo } = await partida({}, ['a', 'b', 'c', 'd']);
    const turno: string = view(s, 'a').turno;
    if (turno !== impostor) {
      await s.engine.leave(code, turno);
      expect(view(s, impostor).pistas).toEqual([{ userId: turno, vuelta: 1, texto: null }]);
    }
    await s.engine.leave(code, impostor);
    const r = view(s, grupo.find((u) => u !== turno)!).revelada;
    expect(r).toMatchObject({ impostor, ganador: 'grupo', motivo: 'abandono' });
  });

  it('votación: no a uno mismo ni a cualquiera, una sola vez; empate = el impostor zafa (30)', async () => {
    const { s, code, impostor, grupo } = await partida();
    expect(await s.engine.action(code, grupo[0], 'voto', { userId: impostor })).toMatchObject({ ok: false, error: 'Ahora no se vota.' });
    await darPistas(s, code, TRES);
    expect(view(s, 'a').hasta).toBeGreaterThan(Date.now());
    for (const raro of [null, 7, 'b', {}, { userId: 5 }, { userId: 'zz' }, { userId: ['b'] }, { userId: { b: 1 } }]) {
      expect(await s.engine.action(code, grupo[0], 'voto', raro)).toMatchObject({ ok: false });
    }
    expect(await s.engine.action(code, grupo[0], 'voto', { userId: grupo[0] })).toMatchObject({ ok: false, error: 'No te podés votar a vos.' });
    expect(await s.engine.action(code, grupo[0], 'voto', { userId: impostor })).toEqual({ ok: true });
    expect(await s.engine.action(code, grupo[0], 'voto', { userId: grupo[1] })).toMatchObject({ ok: false, error: 'Ya votaste.' });
    expect(await s.engine.action(code, grupo[0], 'adivinar', { respuesta: 'x' })).toMatchObject({ ok: false });
    await s.engine.action(code, grupo[1], 'voto', { userId: grupo[0] });
    await s.engine.action(code, impostor, 'voto', { userId: grupo[1] });
    // 1 voto para cada uno = empate → el impostor zafa
    expect(s.state('a').phase).toBe('finished');
    expect(view(s, 'a').revelada).toMatchObject({ ganador: 'impostor', motivo: 'zafo', acusado: null, puntos: { [impostor]: 30 } });
  });

  it('lo descubren y no adivina a tiempo: 10 a cada uno del grupo + 5 a quien lo votó; el impostor 0', async () => {
    const { s, code, impostor, grupo } = await partida();
    await darPistas(s, code, TRES);
    await s.engine.action(code, grupo[0], 'voto', { userId: impostor });
    await s.engine.action(code, grupo[1], 'voto', { userId: grupo[0] });
    await s.engine.action(code, impostor, 'voto', { userId: grupo[0] });
    // grupo[0] tiene 2 votos: no es el impostor → zafa. Otra partida para el caso "lo descubren":
    expect(view(s, 'a').revelada).toMatchObject({ ganador: 'impostor', motivo: 'zafo', acusado: grupo[0] });

    const p = await partida();
    await darPistas(p.s, p.code, TRES);
    await p.s.engine.action(p.code, p.grupo[0], 'voto', { userId: p.impostor });
    await p.s.engine.action(p.code, p.grupo[1], 'voto', { userId: p.impostor });
    await p.s.engine.action(p.code, p.impostor, 'voto', { userId: p.grupo[0] });
    expect(view(p.s, p.grupo[0])).toMatchObject({ etapa: 'adivinanza', descubierto: p.impostor });
    expect(await p.s.engine.action(p.code, p.grupo[0], 'adivinar', { respuesta: 'x' })).toMatchObject({ ok: false, error: 'Sólo el impostor puede adivinar.' });
    for (const raro of [null, {}, { respuesta: 3 }, { respuesta: '' }, { respuesta: 'x'.repeat(61) }]) {
      expect(await p.s.engine.action(p.code, p.impostor, 'adivinar', raro)).toMatchObject({ ok: false });
    }
    await tick(20_000 + 600);
    const st = p.s.state(p.grupo[0]);
    expect(st.phase).toBe('finished');
    expect(view(p.s, p.grupo[0]).revelada).toMatchObject({ ganador: 'grupo', motivo: 'descubierto', acerto: false });
    const puntos = Object.fromEntries(st.players.map((x) => [x.userId, x.score]));
    expect(puntos).toEqual({ [p.grupo[0]]: 15, [p.grupo[1]]: 15, [p.impostor]: 0 });
    // Empate arriba (15 y 15): nadie gana la partida
    expect(st.final!.empate).toBe(true);
  });

  it('lo descubren pero adivina la palabra (sin tildes ni mayúsculas): gana igual con 20', async () => {
    const { s, code, impostor, grupo, palabra } = await partida();
    await darPistas(s, code, TRES);
    await s.engine.action(code, grupo[0], 'voto', { userId: impostor });
    await s.engine.action(code, grupo[1], 'voto', { userId: impostor });
    await s.engine.action(code, impostor, 'voto', { userId: grupo[0] });
    expect(await s.engine.action(code, impostor, 'adivinar', { respuesta: `  ${palabra.toUpperCase()} ` })).toEqual({ ok: true });
    expect(view(s, grupo[0]).revelada).toMatchObject({ ganador: 'impostor', motivo: 'adivino', acerto: true, puntos: { [impostor]: 20 } });
    expect(s.state('a').final!.standings[0]).toMatchObject({ userId: impostor, points: 20, won: true });
  });

  it('si nadie lo vota, gana 30 y cuenta como "invisible" para el logro', async () => {
    const { s, code, impostor, grupo } = await partida();
    await darPistas(s, code, TRES);
    await s.engine.action(code, grupo[0], 'voto', { userId: grupo[1] });
    await s.engine.action(code, grupo[1], 'voto', { userId: grupo[0] });
    await s.engine.action(code, impostor, 'voto', { userId: grupo[0] });
    expect(view(s, 'a').revelada).toMatchObject({ ganador: 'impostor', motivo: 'zafo', acusado: grupo[0], puntos: { [impostor]: 30 } });
    expect(s.store.finishMatch).toHaveBeenCalledWith('match1', expect.any(String), expect.any(Array), true, 'impostor');
    const filas = (s.store.finishMatch.mock.calls[0] as unknown[])[2] as { userId: string; won: boolean; extra?: Record<string, unknown> }[];
    expect(filas.find((f) => f.userId === impostor)).toMatchObject({ won: true, extra: { invisible: true, aciertosVoto: 0 } });
    expect(filas.find((f) => f.userId === grupo[0])).toMatchObject({ won: false, extra: { invisible: false } });
  });

  it('si se acaba el tiempo de votar, se cierra con los votos que hay', async () => {
    const { s, code, impostor, grupo } = await partida();
    await darPistas(s, code, TRES);
    await s.engine.action(code, grupo[0], 'voto', { userId: impostor });
    await tick(30_000 + 600);
    expect(view(s, 'a')).toMatchObject({ etapa: 'adivinanza', descubierto: impostor });
  });

  it('el impostor no es siempre el mismo: en 3 rondas con 3 jugadores le toca a cada uno; cuenta los votos acertados', async () => {
    const s = setup();
    const code = await sala(s, 'impostor', { rounds: 3, seconds: 20 }, TRES);
    await arrancar(s, code);
    const impostores: string[] = [];
    const palabras: string[] = [];
    for (let r = 1; r <= 3; r++) {
      if (r > 1) {
        await tick(10_000 + COUNTDOWN_MS);
        expect(view(s, 'a').numero).toBe(r);
      }
      const imp = TRES.find((u) => view(s, u).rol === 'impostor')!;
      impostores.push(imp);
      palabras.push(view(s, TRES.find((u) => u !== imp)!).palabra);
      await darPistas(s, code, TRES);
      for (const u of TRES) await s.engine.action(code, u, 'voto', { userId: u === imp ? TRES.find((x) => x !== u)! : imp });
      await s.engine.action(code, imp, 'adivinar', { respuesta: 'no sé' });
    }
    expect([...impostores].sort()).toEqual(TRES);
    expect(new Set(palabras).size).toBe(3); // sin repetir palabras en la partida
    expect(s.state('a').phase).toBe('finished');
    const filas = (s.store.finishMatch.mock.calls[0] as unknown[])[2] as { userId: string; extra?: Record<string, unknown> }[];
    for (const f of filas) expect(f.extra).toMatchObject({ aciertosVoto: 2 }); // votó bien las 2 rondas en que no era impostor
  });

  it('usa "contenido visto": lee lo de todos los jugadores y marca las palabras de la partida', async () => {
    const store = fakeStore();
    const vistos = { leer: jest.fn(async () => new Map<string, number>()), marcar: jest.fn(async () => undefined) };
    const engine = new GameEngine(store, { validateAnswers: jest.fn() }, { sendState: () => undefined }, () => {}, vistos);
    const res = await engine.createPrivateRoom('a', { rounds: 3 }, 'impostor');
    if (!res.ok) throw new Error(res.error);
    for (const u of TRES) await engine.join(res.code!, { userId: u });
    await engine.start(res.code!, 'a');
    expect(vistos.leer).toHaveBeenCalledWith(TRES, 'impostor');
    expect(vistos.marcar).toHaveBeenCalledWith(TRES, 'impostor', expect.any(Array));
    expect((vistos.marcar.mock.calls[0] as unknown[])[2]).toHaveLength(3);
  });

  it('cola pública: pocos = 3 a 4 (con 2 no arma) y muchos = 5 a 8', async () => {
    const s = setup();
    const matched: Record<string, string> = {};
    const estados: Record<string, { min: number; max: number }> = {};
    const queue = new Matchmaking((ids, settings, game) => s.engine.createQueueRoom(ids, settings, game), {
      sendQueueState: (u, st) => (estados[u] = st),
      sendMatched: (u, code) => (matched[u] = code),
    });
    queue.join({ userId: 'a', username: 'A' }, '', 'pocos', 'impostor');
    queue.join({ userId: 'b', username: 'B' }, '', 'pocos', 'impostor');
    expect(estados.a).toMatchObject({ min: 3, max: 4 });
    await tick(QUEUE_WAIT_MS);
    expect(matched.a).toBeUndefined();
    queue.join({ userId: 'c', username: 'C' }, '', 'pocos', 'impostor');
    await tick(QUEUE_WAIT_MS);
    expect(matched.a).toBeDefined();
    expect(matched.c).toBe(matched.a);
    queue.join({ userId: 'x', username: 'X' }, '', 'muchos', 'impostor');
    expect(estados.x).toMatchObject({ min: 5, max: 8 });
    for (const u of TRES) await s.engine.join(matched.a, { userId: u });
    expect(s.state('a')).toMatchObject({ game: 'impostor', phase: 'countdown', settings: MODES.impostor.publicSettings('') });
  });
});
