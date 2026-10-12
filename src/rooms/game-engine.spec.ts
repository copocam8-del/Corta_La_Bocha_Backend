import {
  AUTOSTART_MS,
  COLLECT_MS,
  COUNTDOWN_MS,
  GAME_GRACE_MS,
  GameEngine,
  HOST_GRACE_MS,
  LOBBY_GRACE_MS,
  MAX_PLAYERS,
  RESULTS_MS,
  type RoomSnapshot,
  type RoomStore,
  type StoredPlayer,
} from './game-engine';
import { Matchmaking, QUEUE_WAIT_MS } from './matchmaking';
import { letrasDe, TEMATICAS } from '../solo-matches/solo-quick';
import type { AnswerCheck, AnswerToCheck } from '../tutti-frutti/tutti-frutti.service';

const CATS = TEMATICAS.general;

// Base de datos falsa en memoria
function fakeStore() {
  let n = 0;
  const players = new Map<string, StoredPlayer[]>(); // roomId → jugadores
  const codes = new Map<string, string>(); // code → roomId
  const sp = (userId: string): StoredPlayer => ({
    userId,
    username: userId.toUpperCase(),
    avatarId: null,
    roomPlayerId: `rp-${userId}`,
    joinedAt: new Date(Date.now() + n++),
  });
  const store = {
    createRoom: jest.fn(async (isPrivate: boolean, userIds: string[]) => {
      const roomId = `room${++n}`;
      const code = `C${n}`;
      codes.set(code, roomId);
      players.set(roomId, userIds.map(sp));
      return { roomId, code, isPrivate, status: 'waiting', players: players.get(roomId)! };
    }),
    loadRoom: jest.fn(async (code: string) => {
      const roomId = codes.get(code);
      return roomId ? { roomId, code, isPrivate: true, status: 'waiting', players: players.get(roomId)! } : null;
    }),
    addPlayer: jest.fn(async (roomId: string, userId: string) => {
      const p = sp(userId);
      players.get(roomId)!.push(p);
      return p;
    }),
    removePlayer: jest.fn(async () => undefined),
    setRoomStatus: jest.fn(async () => undefined),
    createMatch: jest.fn(async () => 'match1'),
    createRound: jest.fn(async (_m: string, num: number) => `round${num}`),
    saveRound: jest.fn(async () => undefined),
    finishMatch: jest.fn(async () => ({ a: [{ id: 'campeon_del_barrio', name: 'Campeón del barrio', description: '' }] })),
  } satisfies RoomStore;
  return store;
}

// Validador falso: válida si empieza con la letra y no tiene "x"; canónico = la respuesta en minúscula
function fakeValidator(opts: { down?: boolean } = {}) {
  return {
    validateAnswers: jest.fn(async (letter: string, items: AnswerToCheck[]) => {
      const map = new Map<string, AnswerCheck>();
      for (const i of items) {
        if (!i.answer) map.set(i.key, { status: 'empty', canonical: null, reason: 'No respondiste.' });
        else if (opts.down) map.set(i.key, { status: 'unverified', canonical: null, reason: 'Sin validar.' });
        else if (i.answer[0].toUpperCase() === letter && !i.answer.includes('x'))
          map.set(i.key, { status: 'valid', canonical: i.answer.toLowerCase(), reason: 'Válida.' });
        else map.set(i.key, { status: 'invalid', canonical: null, reason: 'No vale.' });
      }
      return map;
    }),
  };
}

function setup(opts: { down?: boolean } = {}) {
  const store = fakeStore();
  const validator = fakeValidator(opts);
  const last = new Map<string, RoomSnapshot>();
  const engine = new GameEngine(store, validator, { sendState: (u, s) => last.set(u, s) });
  return { engine, store, validator, last, state: (u: string) => last.get(u)! };
}

const tick = (ms: number) => jest.advanceTimersByTimeAsync(ms);
const fill = (letter: string, extra: Record<string, string> = {}) =>
  Object.fromEntries(CATS.map((c, i) => [c, extra[c] ?? `${letter}uno${i}`]));

async function salaConDos(s: ReturnType<typeof setup>, settings = { rounds: 1, seconds: 60 }) {
  const res = await s.engine.createPrivateRoom('a', { tematica: 'general', ...settings });
  if (!res.ok) throw new Error('no se creó');
  const code = res.code!;
  await s.engine.join(code, { userId: 'a' });
  await s.engine.join(code, { userId: 'b' });
  return code;
}

async function arrancar(s: ReturnType<typeof setup>, code: string) {
  expect(await s.engine.start(code, 'a')).toEqual({ ok: true });
  await tick(COUNTDOWN_MS);
  return s.state('a').round!.letter!;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('lobby', () => {
  it('quien crea es el anfitrión; los demás entran con el código y todos ven la lista en vivo', async () => {
    const s = setup();
    const code = await salaConDos(s);
    expect(s.state('a').players.map((p) => [p.userId, p.isHost, p.connected])).toEqual([
      ['a', true, true],
      ['b', false, true],
    ]);
    expect(s.state('b').hostUserId).toBe('a');
    expect(s.state('b').code).toBe(code);
  });

  it('sólo el anfitrión cambia la configuración y arranca; hacen falta 2 conectados', async () => {
    const s = setup();
    const res = await s.engine.createPrivateRoom('a', {});
    const code = res.ok ? res.code! : '';
    await s.engine.join(code, { userId: 'a' });
    expect(await s.engine.start(code, 'a')).toMatchObject({ ok: false, error: expect.stringContaining('al menos 2') });
    await s.engine.join(code, { userId: 'b' });
    expect(await s.engine.updateSettings(code, 'b', { rounds: 5 })).toMatchObject({ ok: false });
    expect(await s.engine.updateSettings(code, 'a', { rounds: 5, seconds: 30, tematica: 'mundial' })).toEqual({ ok: true });
    expect(s.state('b').settings).toEqual({ tematica: 'mundial', rounds: 5, seconds: 30 });
    expect(await s.engine.updateSettings(code, 'a', { seconds: 7 })).toMatchObject({ ok: false });
    expect(await s.engine.start(code, 'b')).toMatchObject({ ok: false });
  });

  it('máximo 8 jugadores; no se entra a una partida empezada', async () => {
    const s = setup();
    const res = await s.engine.createPrivateRoom('a', {});
    const code = res.ok ? res.code! : '';
    for (let i = 0; i < MAX_PLAYERS; i++) await s.engine.join(code, { userId: i === 0 ? 'a' : `p${i}` });
    expect(await s.engine.join(code, { userId: 'noveno' })).toMatchObject({ ok: false, error: 'La sala está llena.' });

    const s2 = setup();
    const code2 = await salaConDos(s2);
    await s2.engine.start(code2, 'a');
    expect(await s2.engine.join(code2, { userId: 'tarde' })).toMatchObject({ ok: false, error: 'La partida ya empezó.' });
  });

  it('si el anfitrión sale del lobby, pasa al siguiente; si alguien se desconecta, sale de la lista después de un rato', async () => {
    const s = setup();
    const code = await salaConDos(s);
    await s.engine.join(code, { userId: 'c' });
    await s.engine.leave(code, 'a');
    expect(s.state('b').hostUserId).toBe('b');
    await s.engine.disconnect(code, 'c');
    expect(s.state('b').players.find((p) => p.userId === 'c')?.connected).toBe(false);
    await tick(LOBBY_GRACE_MS);
    expect(s.state('b').players.map((p) => p.userId)).toEqual(['b']);
  });

  it('una sala que no existe da error', async () => {
    const s = setup();
    expect(await s.engine.join('NOEXISTE', { userId: 'a' })).toEqual({ ok: false, error: 'Sala no encontrada.' });
  });
});

describe('ronda', () => {
  it('el servidor sortea letra (de la temática) y categorías, y controla el reloj', async () => {
    const s = setup();
    const code = await salaConDos(s);
    await s.engine.start(code, 'a');
    expect(s.state('a').phase).toBe('countdown');
    expect(s.state('a').round!.letter).toBeNull(); // la letra no se ve durante la cuenta regresiva
    await tick(COUNTDOWN_MS);
    const st = s.state('b');
    expect(st.phase).toBe('playing');
    expect(letrasDe('general')).toContain(st.round!.letter);
    expect(st.round!.categories).toEqual(CATS);
    expect(st.round!.endsAt! - st.serverNow).toBe(60_000);
    expect(s.store.createMatch).toHaveBeenCalledTimes(1);
    expect(s.store.createRound).toHaveBeenCalledWith('match1', 1, st.round!.letter);
  });

  it('¡Basta! corta la ronda para todos (sólo con todo completo) y valida en UNA llamada', async () => {
    const s = setup();
    const code = await salaConDos(s);
    const L = await arrancar(s, code);
    await s.engine.answers(code, 'b', { Jugador: `${L}otro`, Equipo: `${L}uno1` });
    expect(await s.engine.basta(code, 'a', { Jugador: `${L}uno` })).toMatchObject({ ok: false, error: expect.stringContaining('completar todas') });
    expect(await s.engine.basta(code, 'a', fill(L))).toEqual({ ok: true });
    expect(s.state('b').phase).toBe('collecting');
    expect(s.state('b').round!.bastaBy).toBe('A');
    // Llega la respuesta final de b (lo que tenía escrito) → no hace falta esperar más
    await s.engine.answers(code, 'b', { Jugador: `${L}otro`, Equipo: `${L}uno1`, DT: `${L}x` }, true);
    await tick(0);
    expect(s.validator.validateAnswers).toHaveBeenCalledTimes(1);
    const [letra, items] = s.validator.validateAnswers.mock.calls[0];
    expect(letra).toBe(L);
    expect(items).toHaveLength(2 * CATS.length);
  });

  it('puntaje 20/10/5/0 con scoring.ts y resultados por categoría', async () => {
    const s = setup();
    const code = await salaConDos(s);
    const L = await arrancar(s, code);
    // a: todo válido. b: Jugador distinto (10 y 10), Equipo igual que a (5 y 5), DT inválido (a 20), resto vacío (a 20)
    await s.engine.answers(code, 'b', { Jugador: `${L}otro`, Equipo: `${L}uno1`, DT: `${L}x` });
    await s.engine.basta(code, 'a', fill(L));
    await tick(COLLECT_MS);
    const r = s.state('a').lastResult!;
    const pts = (cat: string, u: string) => r.categories.find((c) => c.category === cat)!.entries.find((e) => e.userId === u)!.points;
    expect([pts('Jugador', 'a'), pts('Jugador', 'b')]).toEqual([10, 10]);
    expect([pts('Equipo', 'a'), pts('Equipo', 'b')]).toEqual([5, 5]);
    expect([pts('DT', 'a'), pts('DT', 'b')]).toEqual([20, 0]);
    expect(r.roundPoints).toEqual({ a: 10 + 5 + 20 * 5, b: 15 });
    expect(r.bastaBy).toBe('A');
    expect(s.store.saveRound).toHaveBeenCalledWith('round1', expect.arrayContaining([
      { roomPlayerId: 'rp-b', category: 'Equipo', answer: `${L}uno1`, status: 'valid', points: 5 },
    ]));
  });

  it('si se acaba el tiempo, corta sola, espera las respuestas en viaje y valida', async () => {
    const s = setup();
    const code = await salaConDos(s, { rounds: 3, seconds: 30 });
    const L = await arrancar(s, code);
    await s.engine.answers(code, 'a', { Jugador: `${L}uno` });
    await tick(30_000);
    expect(s.state('a').phase).toBe('collecting');
    await s.engine.answers(code, 'a', { Jugador: `${L}uno`, Equipo: `${L}tarde` }); // última que llegó
    await tick(COLLECT_MS);
    expect(s.state('a').phase).toBe('results');
    expect(s.state('a').players.find((p) => p.userId === 'a')!.score).toBe(40);
    // Después de los resultados, otra ronda con otra letra
    await tick(RESULTS_MS + COUNTDOWN_MS);
    expect(s.state('a').phase).toBe('playing');
    expect(s.state('a').round!.number).toBe(2);
    expect(s.state('a').round!.letter).not.toBe(L);
    // Respuestas tarde (después de validar) se ignoran
  });

  it('al final: ganador, estadísticas una sola vez y logros de cada uno', async () => {
    const s = setup();
    const code = await salaConDos(s);
    const L = await arrancar(s, code);
    await s.engine.basta(code, 'a', fill(L));
    await tick(COLLECT_MS);
    const st = s.state('a');
    expect(st.phase).toBe('finished');
    expect(st.final!.standings[0]).toMatchObject({ userId: 'a', position: 1, won: true });
    expect(st.final!.standings[1]).toMatchObject({ userId: 'b', won: false, points: 0 });
    expect(st.final!.countsForStats).toBe(true);
    expect(st.final!.newAchievements.map((x) => x.id)).toEqual(['campeon_del_barrio']);
    expect(s.state('b').final!.newAchievements).toEqual([]); // cada uno ve sólo los suyos
    expect(s.store.finishMatch).toHaveBeenCalledTimes(1);
    expect(s.store.finishMatch).toHaveBeenCalledWith('match1', expect.any(String), expect.any(Array), true);
    // Jugar otra: vuelve al lobby con los puntos en 0
    expect(await s.engine.playAgain(code, 'b')).toMatchObject({ ok: false });
    expect(await s.engine.playAgain(code, 'a')).toEqual({ ok: true });
    expect(s.state('b').phase).toBe('lobby');
    expect(s.state('b').players.every((p) => p.score === 0)).toBe(true);
  });

  it('si la IA no valida, la partida termina pero no cuenta para estadísticas', async () => {
    const s = setup({ down: true });
    const code = await salaConDos(s);
    const L = await arrancar(s, code);
    await s.engine.basta(code, 'a', fill(L));
    await tick(COLLECT_MS);
    expect(s.state('a').lastResult!.incomplete).toBe(true);
    expect(s.state('a').final!.countsForStats).toBe(false);
    expect(s.store.finishMatch).toHaveBeenCalledWith('match1', expect.any(String), expect.any(Array), false);
  });
});

describe('desconexiones', () => {
  it('si alguien recarga, vuelve a la partida con lo que tenía escrito', async () => {
    const s = setup();
    const code = await salaConDos(s);
    const L = await arrancar(s, code);
    await s.engine.answers(code, 'b', { Jugador: `${L}mio` });
    await s.engine.disconnect(code, 'b');
    expect(s.state('a').players.find((p) => p.userId === 'b')!.connected).toBe(false);
    expect(await s.engine.join(code, { userId: 'b' })).toEqual({ ok: true, code });
    expect(s.state('b').phase).toBe('playing');
    expect(s.state('b').round!.myAnswers).toEqual({ Jugador: `${L}mio` });
  });

  it('si el anfitrión se desconecta en la partida, pasa a otro', async () => {
    const s = setup();
    const code = await salaConDos(s, { rounds: 3, seconds: 60 });
    await s.engine.join(code, { userId: 'c' });
    await arrancar(s, code);
    await s.engine.disconnect(code, 'a');
    await tick(HOST_GRACE_MS);
    expect(s.state('b').hostUserId).toBe('b');
    expect(s.state('b').notice).toContain('ahora el anfitrión es B');
  });

  it('si quedan menos de 2, espera un rato y termina (el que se fue cuenta como abandono)', async () => {
    const s = setup();
    const code = await salaConDos(s, { rounds: 3, seconds: 30 });
    const L = await arrancar(s, code);
    await s.engine.basta(code, 'a', fill(L));
    await tick(COLLECT_MS); // se jugó una ronda
    await s.engine.leave(code, 'b');
    expect(s.state('a').phase).toBe('results');
    await tick(GAME_GRACE_MS);
    const st = s.state('a');
    expect(st.phase).toBe('finished');
    expect(st.final!.reason).toBe('not_enough_players');
    expect(st.final!.standings.find((x) => x.userId === 'b')).toMatchObject({ abandoned: true, won: false });
    expect(s.store.finishMatch).toHaveBeenCalledTimes(1);
    expect(await s.engine.join(code, { userId: 'b' })).toMatchObject({ ok: true }); // ya terminó: puede volver a la sala
  });

  it('si vuelve a tiempo, la partida sigue', async () => {
    const s = setup();
    const code = await salaConDos(s, { rounds: 3, seconds: 60 });
    await arrancar(s, code);
    await s.engine.disconnect(code, 'b');
    await tick(GAME_GRACE_MS - 1000);
    await s.engine.join(code, { userId: 'b' });
    await tick(5000);
    expect(s.state('a').phase).toBe('playing');
  });

  it('quien abandonó no puede volver a entrar a esa partida', async () => {
    const s = setup();
    const code = await salaConDos(s, { rounds: 3, seconds: 60 });
    await s.engine.join(code, { userId: 'c' });
    await arrancar(s, code);
    await s.engine.leave(code, 'c');
    expect(await s.engine.join(code, { userId: 'c' })).toEqual({ ok: false, error: 'Abandonaste esta partida.' });
  });
});

describe('cola pública', () => {
  it('con el mínimo de jugadores espera un rato por más, arma la sala y arranca sola cuando entran', async () => {
    const s = setup();
    const matched: Record<string, string> = {};
    const queue = new Matchmaking((ids, settings) => s.engine.createQueueRoom(ids, settings), {
      sendQueueState: () => undefined,
      sendMatched: (u, code) => (matched[u] = code),
    });
    expect(queue.join({ userId: 'a', username: 'A' }, 'mundial', 'pocos')).toEqual({ ok: true });
    expect(queue.join({ userId: 'b', username: 'B' }, 'mundial', 'pocos')).toEqual({ ok: true });
    expect(queue.join({ userId: 'z', username: 'Z' }, 'general', 'pocos')).toEqual({ ok: true }); // otra temática
    await tick(QUEUE_WAIT_MS);
    expect(matched.a).toBeDefined();
    expect(matched.b).toBe(matched.a);
    expect(matched.z).toBeUndefined();
    expect(queue.isQueued('a')).toBe(false);

    const code = matched.a;
    await s.engine.join(code, { userId: 'a' });
    expect(s.state('a').phase).toBe('lobby');
    await s.engine.join(code, { userId: 'b' });
    expect(s.state('a').phase).toBe('countdown'); // entraron todos: arranca
    expect(s.state('a').settings).toEqual({ tematica: 'mundial', rounds: 3, seconds: 60 });
  });

  it('si no entran suficientes, la sala se cierra', async () => {
    const s = setup();
    const code = await s.engine.createQueueRoom(['a', 'b'], { tematica: 'general', rounds: 3, seconds: 60 });
    await s.engine.join(code, { userId: 'a' });
    await tick(AUTOSTART_MS);
    expect(s.state('a').phase).toBe('closed');
    expect(s.state('a').notice).toContain('No se pudo armar la partida');
  });

  it('si se llena, arma la sala en el momento; si alguien sale, deja de contar', async () => {
    const s = setup();
    const matched: Record<string, string> = {};
    const queue = new Matchmaking((ids, settings) => s.engine.createQueueRoom(ids, settings), {
      sendQueueState: () => undefined,
      sendMatched: (u, code) => (matched[u] = code),
    });
    queue.join({ userId: 'a', username: 'A' }, 'general', 'pocos');
    queue.join({ userId: 'b', username: 'B' }, 'general', 'pocos');
    queue.leave('b');
    await tick(QUEUE_WAIT_MS);
    expect(matched.a).toBeUndefined();
    for (const u of ['b', 'c', 'd', 'e']) queue.join({ userId: u, username: u }, 'general', 'pocos');
    await tick(0);
    expect(Object.keys(matched).sort()).toEqual(['a', 'b', 'c', 'd']); // máximo 4 en "pocos"
    expect(queue.isQueued('e')).toBe(true);
    expect(queue.join({ userId: 'x', username: 'X' }, 'inventada', 'pocos')).toMatchObject({ ok: false });
  });
});
