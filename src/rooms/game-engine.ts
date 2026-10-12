import { scoreRound, type AnswerStatus, type CategoryEntry } from '../tutti-frutti/scoring';
import { LETRAS, TEMATICAS, letrasDe } from '../solo-matches/solo-quick';
import type { AnswerCheck, AnswerToCheck } from '../tutti-frutti/tutti-frutti.service';
import type { UnlockedAchievement } from '../achievements/achievements.service';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Motor del multijugador. El SERVIDOR manda en todo: sortea letra y categorías, controla el reloj
// y el ¡Basta!, junta las respuestas, las valida (una sola llamada a la IA por ronda, como en la
// partida contra la máquina) y puntúa con scoring.ts. Los clientes sólo muestran el estado que
// reciben ("room:state") y mandan lo que escribe cada jugador.
//
// El estado de cada sala vive en memoria (alcanza con una sola instancia en Render). En la base
// quedan la sala, sus jugadores, la partida, las rondas y las respuestas, y al final las
// estadísticas y logros (una sola vez por partida). Si el servidor se reinicia, las partidas en
// curso se pierden y las salas vuelven al lobby.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const ROUND_OPTIONS = [1, 3, 5];
export const SECONDS_OPTIONS = [30, 45, 60, 90, 120];
export const DEFAULT_SETTINGS: Settings = { tematica: 'general', rounds: 3, seconds: 60 };
export const MAX_ANSWER_LENGTH = 150;

export const COUNTDOWN_MS = 3_000; // "¡Preparados!" antes de cada ronda
export const COLLECT_MS = 2_000; // al cortar la ronda, espera las últimas respuestas en viaje
export const RESULTS_MS = 10_000; // resultados de la ronda antes de la siguiente
export const LOBBY_GRACE_MS = 15_000; // en el lobby, cuánto se espera a alguien que se desconectó
export const HOST_GRACE_MS = 10_000; // si el anfitrión se desconecta, cuánto antes de pasarlo a otro
export const GAME_GRACE_MS = 20_000; // en partida: si quedan menos de 2 conectados, cuánto se espera
export const AUTOSTART_MS = 15_000; // salas de la cola pública: cuánto se espera a que entren todos

export type Phase = 'lobby' | 'countdown' | 'playing' | 'collecting' | 'validating' | 'results' | 'finished' | 'closed';
const IN_GAME: Phase[] = ['countdown', 'playing', 'collecting', 'validating', 'results'];

export interface Settings {
  tematica: string;
  rounds: number;
  seconds: number;
}

export interface StoredPlayer {
  userId: string;
  username: string;
  avatarId: string | null;
  roomPlayerId: string;
  joinedAt: Date;
}

export interface StoredRoom {
  roomId: string;
  code: string;
  isPrivate: boolean;
  status: string;
  players: StoredPlayer[];
}

export interface FinalPlayerResult {
  userId: string;
  points: number;
  won: boolean;
  abandoned: boolean;
}

export interface SavedAnswer {
  roomPlayerId: string;
  category: string;
  answer: string | null;
  status: AnswerStatus;
  points: number;
}

// Lo que el motor necesita de la base (lo implementa RoomsService con Prisma)
export interface RoomStore {
  createRoom(isPrivate: boolean, userIds: string[]): Promise<StoredRoom>;
  loadRoom(code: string): Promise<StoredRoom | null>;
  addPlayer(roomId: string, userId: string): Promise<StoredPlayer>;
  removePlayer(roomId: string, userId: string): Promise<void>;
  setRoomStatus(roomId: string, status: 'waiting' | 'playing' | 'closed'): Promise<void>;
  createMatch(roomId: string, settings: Settings): Promise<string>;
  createRound(matchId: string, roundNumber: number, letter: string): Promise<string>;
  saveRound(roundId: string, answers: SavedAnswer[]): Promise<void>;
  finishMatch(
    matchId: string,
    roomId: string,
    results: FinalPlayerResult[],
    countsForStats: boolean,
  ): Promise<Record<string, UnlockedAchievement[]>>;
}

export interface Validator {
  validateAnswers(letter: string, items: AnswerToCheck[]): Promise<Map<string, AnswerCheck>>;
}

// Cómo el motor les habla a los jugadores (lo implementa el gateway de Socket.IO)
export interface EngineOutput {
  sendState(userId: string, state: RoomSnapshot): void;
}

export interface CellResult {
  userId: string;
  username: string;
  answer: string | null;
  status: AnswerStatus;
  canonical: string | null;
  reason: string;
  points: number;
}

export interface RoundResult {
  number: number;
  letter: string;
  bastaBy: string | null; // nombre de quien cantó ¡Basta! (null si se acabó el tiempo)
  incomplete: boolean; // la IA no pudo validar alguna respuesta (0 puntos)
  categories: { category: string; entries: CellResult[] }[];
  roundPoints: Record<string, number>;
}

export interface FinalResult {
  reason: 'completed' | 'not_enough_players';
  countsForStats: boolean;
  standings: { userId: string; username: string; points: number; position: number; won: boolean; abandoned: boolean }[];
  newAchievements: UnlockedAchievement[]; // sólo los del jugador que recibe el estado
}

export interface RoomSnapshot {
  code: string;
  isPrivate: boolean;
  me: string;
  hostUserId: string | null;
  phase: Phase;
  settings: Settings;
  minPlayers: number;
  maxPlayers: number;
  serverNow: number; // para que el cliente corrija la diferencia de reloj
  players: { userId: string; username: string; avatarId: string | null; connected: boolean; left: boolean; isHost: boolean; score: number }[];
  round: null | {
    number: number;
    total: number;
    letter: string | null; // null durante la cuenta regresiva
    categories: string[];
    endsAt: number | null;
    bastaBy: string | null;
    myAnswers: Record<string, string>;
  };
  nextAt: number | null; // cuándo empieza la próxima fase (cuenta regresiva, resultados)
  lastResult: RoundResult | null;
  history: RoundResult[];
  final: FinalResult | null;
  notice: string | null; // aviso para mostrar (ej. "Se fue Juan: ahora el anfitrión es Ana")
}

interface Player {
  userId: string;
  username: string;
  avatarId: string | null;
  roomPlayerId: string;
  joinedAt: number;
  connected: boolean;
  left: boolean; // abandonó la partida en curso (no vuelve a entrar en ella)
  score: number;
  answers: Record<string, string>;
  finalSent: boolean;
  timer?: NodeJS.Timeout;
}

interface Room {
  code: string;
  roomId: string;
  isPrivate: boolean;
  hostUserId: string | null;
  players: Map<string, Player>;
  settings: Settings;
  phase: Phase;
  matchId: string | null;
  roundNumber: number;
  roundId: string | null;
  letter: string | null;
  categories: string[];
  endsAt: number | null;
  nextAt: number | null;
  bastaBy: string | null;
  usedLetters: string[];
  history: RoundResult[];
  incomplete: boolean;
  final: (Omit<FinalResult, 'newAchievements'> & { achievements: Record<string, UnlockedAchievement[]> }) | null;
  notice: string | null;
  phaseTimer?: NodeJS.Timeout;
  lowPlayersTimer?: NodeJS.Timeout;
  autoStartTimer?: NodeJS.Timeout;
  autoStart: boolean;
}

export type Result = { ok: true; code?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

export function validSettings(s: Partial<Settings>): Settings | null {
  const tematica = s.tematica ?? DEFAULT_SETTINGS.tematica;
  const rounds = Number(s.rounds ?? DEFAULT_SETTINGS.rounds);
  const seconds = Number(s.seconds ?? DEFAULT_SETTINGS.seconds);
  if (!TEMATICAS[tematica] || !ROUND_OPTIONS.includes(rounds) || !SECONDS_OPTIONS.includes(seconds)) return null;
  return { tematica, rounds, seconds };
}

function cleanAnswers(raw: unknown, categories: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const c of categories) {
    const v = (raw as Record<string, unknown>)[c];
    if (typeof v === 'string') out[c] = v.slice(0, MAX_ANSWER_LENGTH);
  }
  return out;
}

export class GameEngine {
  private readonly rooms = new Map<string, Room>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: RoomStore,
    private readonly validator: Validator,
    private readonly output: EngineOutput,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  // Todo lo que toca una sala pasa en fila (una cosa por vez), así dos eventos simultáneos no se pisan
  private withLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(code) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(code, next.catch(() => undefined));
    return next;
  }

  // ── Crear y entrar ────────────────────────────────────────────────────────────────────────

  async createPrivateRoom(userId: string, settings: Partial<Settings>): Promise<Result> {
    const s = validSettings(settings);
    if (!s) return fail('Configuración inválida.');
    const stored = await this.store.createRoom(true, [userId]);
    const room = this.fromStored(stored, s);
    room.hostUserId = userId;
    this.rooms.set(room.code, room);
    return { ok: true, code: room.code };
  }

  // Sala armada por la cola pública: arranca sola cuando entran todos (o a los AUTOSTART_MS)
  async createQueueRoom(userIds: string[], settings: Settings): Promise<string> {
    const stored = await this.store.createRoom(false, userIds);
    const room = this.fromStored(stored, settings);
    room.hostUserId = userIds[0];
    room.autoStart = true;
    this.rooms.set(room.code, room);
    room.autoStartTimer = setTimeout(() => void this.withLock(room.code, () => this.autoStart(room, true)), AUTOSTART_MS);
    return room.code;
  }

  join(code: string, user: { userId: string }): Promise<Result> {
    code = (code ?? '').toUpperCase().trim();
    return this.withLock(code, async () => {
      let room = this.rooms.get(code);
      if (!room) {
        const stored = await this.store.loadRoom(code);
        if (!stored || stored.status === 'closed') return fail('Sala no encontrada.');
        room = this.fromStored(stored, DEFAULT_SETTINGS);
        if (stored.status !== 'waiting') await this.store.setRoomStatus(room.roomId, 'waiting'); // se reinició el server
        this.rooms.set(code, room);
        // Los que figuran en la base pero no vuelven a entrar, salen del lobby después de un rato
        for (const p of room.players.values()) if (p.userId !== user.userId) this.scheduleLobbyRemoval(room, p);
      }
      if (room.phase === 'closed') return fail('La sala se cerró.');

      const existing = room.players.get(user.userId);
      if (existing) {
        if (existing.left && IN_GAME.includes(room.phase)) return fail('Abandonaste esta partida.');
        if (existing.timer) clearTimeout(existing.timer);
        existing.timer = undefined;
        existing.connected = true;
        existing.left = false;
        if (!room.hostUserId) room.hostUserId = existing.userId;
        this.checkPlayers(room);
        if (room.autoStart) await this.autoStart(room, false);
        this.broadcast(room);
        return { ok: true, code };
      }

      if (room.phase !== 'lobby') return fail('La partida ya empezó.');
      if (!room.isPrivate) return fail('Esta sala es de la cola pública: entrá por "Partida pública".');
      if ([...room.players.values()].filter((p) => !p.left).length >= MAX_PLAYERS) return fail('La sala está llena.');
      const stored = await this.store.addPlayer(room.roomId, user.userId);
      room.players.set(user.userId, this.newPlayer(stored, true));
      if (!room.hostUserId) room.hostUserId = user.userId;
      this.broadcast(room);
      return { ok: true, code };
    });
  }

  // El jugador se fue a propósito (botón "Salir")
  leave(code: string, userId: string): Promise<Result> {
    return this.withLock(code, async () => {
      const room = this.rooms.get(code);
      const p = room?.players.get(userId);
      if (!room || !p) return { ok: true };
      if (p.timer) clearTimeout(p.timer);
      if (IN_GAME.includes(room.phase)) {
        p.left = true;
        p.connected = false;
        room.notice = `${p.username} abandonó la partida.`;
        if (room.hostUserId === userId) this.passHost(room);
        this.checkPlayers(room);
        this.broadcast(room);
      } else {
        await this.removePlayer(room, p);
      }
      return { ok: true };
    });
  }

  // Se cerró la pestaña o se cortó la conexión: se espera un rato por si vuelve (recarga)
  disconnect(code: string, userId: string): Promise<void> {
    return this.withLock(code, async () => {
      const room = this.rooms.get(code);
      const p = room?.players.get(userId);
      if (!room || !p || p.left) return;
      p.connected = false;
      if (IN_GAME.includes(room.phase)) {
        this.checkPlayers(room);
        if (room.hostUserId === userId) {
          p.timer = setTimeout(() => void this.withLock(code, async () => {
            if (!p.connected && room.hostUserId === userId) { this.passHost(room); this.broadcast(room); }
          }), HOST_GRACE_MS);
        }
      } else {
        this.scheduleLobbyRemoval(room, p);
      }
      this.broadcast(room);
    });
  }

  private scheduleLobbyRemoval(room: Room, p: Player) {
    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(() => void this.withLock(room.code, async () => {
      if (!p.connected && room.players.get(p.userId) === p && !IN_GAME.includes(room.phase)) await this.removePlayer(room, p);
    }), LOBBY_GRACE_MS);
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────────────────────

  updateSettings(code: string, userId: string, settings: Partial<Settings>): Promise<Result> {
    return this.withLock(code, async () => {
      const room = this.rooms.get(code);
      if (!room) return fail('Sala no encontrada.');
      if (room.hostUserId !== userId) return fail('Sólo el anfitrión puede cambiar la configuración.');
      if (room.phase !== 'lobby') return fail('La partida ya empezó.');
      const s = validSettings({ ...room.settings, ...settings });
      if (!s) return fail('Configuración inválida.');
      room.settings = s;
      this.broadcast(room);
      return { ok: true };
    });
  }

  start(code: string, userId: string): Promise<Result> {
    return this.withLock(code, async () => {
      const room = this.rooms.get(code);
      if (!room) return fail('Sala no encontrada.');
      if (room.hostUserId !== userId) return fail('Sólo el anfitrión puede arrancar la partida.');
      if (room.phase !== 'lobby') return fail('La partida ya empezó.');
      if (this.connectedPlayers(room).length < MIN_PLAYERS) return fail(`Hacen falta al menos ${MIN_PLAYERS} jugadores conectados.`);
      await this.startMatch(room);
      return { ok: true };
    });
  }

  // Después de la partida, el anfitrión vuelve todos al lobby para jugar otra
  playAgain(code: string, userId: string): Promise<Result> {
    return this.withLock(code, async () => {
      const room = this.rooms.get(code);
      if (!room) return fail('Sala no encontrada.');
      if (room.phase !== 'finished') return fail('La partida no terminó.');
      if (room.hostUserId !== userId) return fail('Sólo el anfitrión puede volver al lobby.');
      for (const p of [...room.players.values()]) if (p.left || !p.connected) await this.removePlayer(room, p, false);
      room.phase = 'lobby';
      room.final = null;
      room.history = [];
      room.notice = null;
      for (const p of room.players.values()) p.score = 0;
      this.broadcast(room);
      return { ok: true };
    });
  }

  // ── Durante la ronda ──────────────────────────────────────────────────────────────────────

  // Borrador de respuestas (el cliente lo manda mientras escribe). final = ya cortó la ronda.
  answers(code: string, userId: string, raw: unknown, final = false): Promise<Result> {
    return this.withLock(code, async () => {
      const room = this.rooms.get(code);
      const p = room?.players.get(userId);
      if (!room || !p || p.left) return fail('No estás en esta partida.');
      if (room.phase !== 'playing' && room.phase !== 'collecting') return { ok: true }; // llegó tarde: se ignora
      p.answers = cleanAnswers(raw, room.categories);
      if (room.phase === 'collecting' && final) {
        p.finalSent = true;
        if (this.activePlayers(room).filter((x) => x.connected).every((x) => x.finalSent)) await this.validateRound(room);
      }
      return { ok: true };
    });
  }

  basta(code: string, userId: string, raw: unknown): Promise<Result> {
    return this.withLock(code, async () => {
      const room = this.rooms.get(code);
      const p = room?.players.get(userId);
      if (!room || !p || p.left) return fail('No estás en esta partida.');
      if (room.phase !== 'playing') return fail('La ronda ya terminó.');
      const answers = cleanAnswers(raw, room.categories);
      if (room.categories.some((c) => !(answers[c] ?? '').trim())) {
        return fail('Para cantar ¡Basta! tenés que completar todas las categorías.');
      }
      p.answers = answers;
      p.finalSent = true;
      this.endRound(room, p.userId);
      return { ok: true };
    });
  }

  // ── Para el gateway y los tests ───────────────────────────────────────────────────────────

  snapshotFor(code: string, userId: string): RoomSnapshot | null {
    const room = this.rooms.get(code);
    return room ? this.snapshot(room, userId) : null;
  }

  isPlayer(code: string, userId: string): boolean {
    return !!this.rooms.get(code)?.players.has(userId);
  }

  // ── Internos ──────────────────────────────────────────────────────────────────────────────

  private fromStored(stored: StoredRoom, settings: Settings): Room {
    const players = new Map<string, Player>();
    for (const sp of stored.players) players.set(sp.userId, this.newPlayer(sp, false));
    const first = [...players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    return {
      code: stored.code,
      roomId: stored.roomId,
      isPrivate: stored.isPrivate,
      hostUserId: first?.userId ?? null,
      players,
      settings,
      phase: 'lobby',
      matchId: null,
      roundNumber: 0,
      roundId: null,
      letter: null,
      categories: [],
      endsAt: null,
      nextAt: null,
      bastaBy: null,
      usedLetters: [],
      history: [],
      incomplete: false,
      final: null,
      notice: null,
      autoStart: false,
    };
  }

  private newPlayer(sp: StoredPlayer, connected: boolean): Player {
    return {
      userId: sp.userId,
      username: sp.username,
      avatarId: sp.avatarId,
      roomPlayerId: sp.roomPlayerId,
      joinedAt: sp.joinedAt.getTime(),
      connected,
      left: false,
      score: 0,
      answers: {},
      finalSent: false,
    };
  }

  private activePlayers(room: Room) {
    return [...room.players.values()].filter((p) => !p.left);
  }

  private connectedPlayers(room: Room) {
    return this.activePlayers(room).filter((p) => p.connected);
  }

  private passHost(room: Room) {
    const next = this.connectedPlayers(room)
      .filter((p) => p.userId !== room.hostUserId)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (!next) return;
    const before = room.players.get(room.hostUserId ?? '');
    room.hostUserId = next.userId;
    room.notice = `${before ? `${before.username} se fue: a` : 'A'}hora el anfitrión es ${next.username}.`;
  }

  private async removePlayer(room: Room, p: Player, broadcast = true) {
    if (p.timer) clearTimeout(p.timer);
    room.players.delete(p.userId);
    await this.store.removePlayer(room.roomId, p.userId).catch((e) => this.log(`removePlayer: ${e}`));
    if (room.players.size === 0) {
      this.clearTimers(room);
      room.phase = 'closed';
      await this.store.setRoomStatus(room.roomId, 'closed').catch(() => undefined);
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostUserId === p.userId) {
      room.hostUserId = null;
      this.passHost(room);
      if (!room.hostUserId) room.hostUserId = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0].userId;
    }
    if (broadcast) this.broadcast(room);
  }

  private clearTimers(room: Room) {
    for (const t of [room.phaseTimer, room.lowPlayersTimer, room.autoStartTimer]) if (t) clearTimeout(t);
    room.phaseTimer = room.lowPlayersTimer = room.autoStartTimer = undefined;
    for (const p of room.players.values()) if (p.timer) clearTimeout(p.timer);
  }

  private schedule(room: Room, ms: number, fn: (room: Room) => Promise<void> | void) {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    room.phaseTimer = setTimeout(() => void this.withLock(room.code, async () => fn(room)), ms);
  }

  private async autoStart(room: Room, timeUp: boolean) {
    if (!room.autoStart || room.phase !== 'lobby') return;
    const all = this.activePlayers(room);
    const connected = all.filter((p) => p.connected);
    if (connected.length === all.length || timeUp) {
      room.autoStart = false;
      if (room.autoStartTimer) clearTimeout(room.autoStartTimer);
      if (connected.length >= MIN_PLAYERS) {
        for (const p of all) if (!p.connected) await this.removePlayer(room, p, false);
        await this.startMatch(room);
      } else {
        room.notice = 'No se pudo armar la partida: no entraron suficientes jugadores.';
        room.phase = 'closed';
        this.broadcast(room);
        this.clearTimers(room);
        await this.store.setRoomStatus(room.roomId, 'closed').catch(() => undefined);
        this.rooms.delete(room.code);
      }
    }
  }

  private async startMatch(room: Room) {
    room.matchId = await this.store.createMatch(room.roomId, room.settings);
    await this.store.setRoomStatus(room.roomId, 'playing');
    room.roundNumber = 0;
    room.usedLetters = [];
    room.history = [];
    room.incomplete = false;
    room.final = null;
    room.notice = null;
    for (const p of room.players.values()) p.score = 0;
    this.beginCountdown(room);
  }

  private beginCountdown(room: Room) {
    room.roundNumber += 1;
    const pool = letrasDe(room.settings.tematica).filter((l) => !room.usedLetters.includes(l));
    const letters = pool.length ? pool : letrasDe(room.settings.tematica).length ? letrasDe(room.settings.tematica) : LETRAS;
    room.letter = letters[Math.floor(Math.random() * letters.length)];
    room.usedLetters.push(room.letter);
    room.categories = TEMATICAS[room.settings.tematica];
    room.phase = 'countdown';
    room.bastaBy = null;
    room.endsAt = null;
    room.nextAt = Date.now() + COUNTDOWN_MS;
    for (const p of room.players.values()) {
      p.answers = {};
      p.finalSent = false;
    }
    this.broadcast(room);
    this.schedule(room, COUNTDOWN_MS, (r) => this.beginRound(r));
  }

  private async beginRound(room: Room) {
    if (room.phase !== 'countdown' || !room.matchId || !room.letter) return;
    room.roundId = await this.store.createRound(room.matchId, room.roundNumber, room.letter);
    room.phase = 'playing';
    room.nextAt = null;
    room.endsAt = Date.now() + room.settings.seconds * 1000;
    this.broadcast(room);
    this.schedule(room, room.settings.seconds * 1000, (r) => this.endRound(r, null));
  }

  // Corta la ronda para todos (por tiempo o porque alguien cantó ¡Basta!)
  private endRound(room: Room, bastaUserId: string | null) {
    if (room.phase !== 'playing') return;
    room.phase = 'collecting';
    room.bastaBy = bastaUserId ? (room.players.get(bastaUserId)?.username ?? null) : null;
    room.endsAt = null;
    this.broadcast(room);
    this.schedule(room, COLLECT_MS, (r) => this.validateRound(r));
  }

  private async validateRound(room: Room) {
    if (room.phase !== 'collecting') return;
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    room.phase = 'validating';
    this.broadcast(room);

    const roundId = room.roundId;
    const letter = room.letter!;
    const categories = room.categories;
    const participants = this.activePlayers(room);
    const items: AnswerToCheck[] = [];
    for (const p of participants) {
      for (const c of categories) items.push({ key: `${p.userId}::${c}`, category: c, answer: (p.answers[c] ?? '').trim() || null });
    }

    // La IA puede tardar: la llamada se hace FUERA de la fila de la sala (así se puede seguir
    // entrando, saliendo y reconectando mientras tanto). Después se vuelve a la fila.
    void (async () => {
      let checks: Map<string, AnswerCheck>;
      try {
        checks = await this.validator.validateAnswers(letter, items);
      } catch (e) {
        this.log(`Validación de la ronda falló: ${e}`);
        checks = new Map();
      }
      await this.withLock(room.code, () => this.applyResults(room, roundId, participants, checks));
    })();
  }

  private async applyResults(room: Room, roundId: string | null, participants: Player[], checks: Map<string, AnswerCheck>) {
    if (room.phase !== 'validating' || room.roundId !== roundId || this.rooms.get(room.code) !== room) return;
    const categories = room.categories;
    const checkOf = (p: Player, c: string): AnswerCheck =>
      checks.get(`${p.userId}::${c}`) ?? { status: 'unverified', canonical: null, reason: 'No se pudo validar (la IA no respondió). No suma puntos.' };

    const byCategory: Record<string, CategoryEntry[]> = {};
    for (const c of categories) {
      byCategory[c] = participants.map((p) => {
        const ch = checkOf(p, c);
        return { playerId: p.userId, status: ch.status, canonical: ch.canonical ?? p.answers[c] ?? null };
      });
    }
    const scores = scoreRound(byCategory);

    const result: RoundResult = {
      number: room.roundNumber,
      letter: room.letter!,
      bastaBy: room.bastaBy,
      incomplete: false,
      categories: categories.map((c) => ({
        category: c,
        entries: participants.map((p) => {
          const ch = checkOf(p, c);
          return {
            userId: p.userId,
            username: p.username,
            answer: (p.answers[c] ?? '').trim() || null,
            status: ch.status,
            canonical: ch.canonical,
            reason: ch.reason,
            points: scores[p.userId]?.byCategory[c] ?? 0,
          };
        }),
      })),
      roundPoints: Object.fromEntries(participants.map((p) => [p.userId, scores[p.userId]?.total ?? 0])),
    };
    result.incomplete = result.categories.some((c) => c.entries.some((e) => e.status === 'unverified'));
    room.incomplete ||= result.incomplete;
    for (const p of participants) p.score += result.roundPoints[p.userId] ?? 0;
    room.history.push(result);

    if (roundId) {
      await this.store
        .saveRound(
          roundId,
          result.categories.flatMap((c) =>
            c.entries.map((e) => ({
              roomPlayerId: room.players.get(e.userId)!.roomPlayerId,
              category: c.category,
              answer: e.answer,
              status: e.status,
              points: e.points,
            })),
          ),
        )
        .catch((e) => this.log(`saveRound: ${e}`));
    }

    if (room.roundNumber >= room.settings.rounds) {
      await this.finishMatch(room, 'completed');
      return;
    }
    room.phase = 'results';
    room.nextAt = Date.now() + RESULTS_MS;
    this.broadcast(room);
    this.schedule(room, RESULTS_MS, (r) => {
      if (r.phase === 'results') this.beginCountdown(r);
    });
  }

  // Si quedan menos de 2 conectados durante la partida, se espera un rato y se termina
  private checkPlayers(room: Room) {
    if (!IN_GAME.includes(room.phase)) return;
    const enough = this.connectedPlayers(room).length >= MIN_PLAYERS;
    if (enough && room.lowPlayersTimer) {
      clearTimeout(room.lowPlayersTimer);
      room.lowPlayersTimer = undefined;
    } else if (!enough && !room.lowPlayersTimer) {
      room.notice = 'Quedan menos de 2 jugadores: si nadie vuelve, la partida termina.';
      room.lowPlayersTimer = setTimeout(() => void this.withLock(room.code, async () => {
        room.lowPlayersTimer = undefined;
        if (IN_GAME.includes(room.phase) && this.connectedPlayers(room).length < MIN_PLAYERS) {
          // Los que no volvieron se cuentan como que abandonaron
          for (const p of this.activePlayers(room)) if (!p.connected) p.left = true;
          await this.finishMatch(room, 'not_enough_players');
        }
      }), GAME_GRACE_MS);
    }
  }

  private async finishMatch(room: Room, reason: FinalResult['reason']) {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    if (room.lowPlayersTimer) clearTimeout(room.lowPlayersTimer);
    room.phaseTimer = room.lowPlayersTimer = undefined;
    const matchId = room.matchId;
    room.matchId = null; // así nunca se termina dos veces
    room.phase = 'finished';
    room.endsAt = room.nextAt = null;

    const everyone = [...room.players.values()];
    const best = Math.max(0, ...everyone.filter((p) => !p.left).map((p) => p.score));
    const sorted = everyone.sort((a, b) => Number(a.left) - Number(b.left) || b.score - a.score);
    let lastPoints: number | null = null;
    let lastPosition = 0;
    const standings = sorted.map((p, i) => {
      if (p.score !== lastPoints) {
        lastPosition = i + 1;
        lastPoints = p.score;
      }
      return {
        userId: p.userId,
        username: p.username,
        points: p.score,
        position: lastPosition,
        won: !p.left && best > 0 && p.score === best,
        abandoned: p.left,
      };
    });
    // Cuenta para estadísticas si se jugó al menos una ronda y la IA validó todo
    const countsForStats = room.history.length > 0 && !room.incomplete;

    let achievements: Record<string, UnlockedAchievement[]> = {};
    if (matchId) {
      try {
        achievements = await this.store.finishMatch(
          matchId,
          room.roomId,
          standings.map((s) => ({ userId: s.userId, points: s.points, won: s.won, abandoned: s.abandoned })),
          countsForStats,
        );
      } catch (e) {
        this.log(`finishMatch: ${e}`);
      }
    }
    room.final = { reason, countsForStats, standings, achievements };
    room.notice = reason === 'not_enough_players' ? 'La partida terminó porque quedaron menos de 2 jugadores.' : null;
    this.broadcast(room);
  }

  private snapshot(room: Room, userId: string): RoomSnapshot {
    const me = room.players.get(userId);
    const inRound = ['countdown', 'playing', 'collecting', 'validating'].includes(room.phase);
    return {
      code: room.code,
      isPrivate: room.isPrivate,
      me: userId,
      hostUserId: room.hostUserId,
      phase: room.phase,
      settings: room.settings,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      serverNow: Date.now(),
      players: [...room.players.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => ({
          userId: p.userId,
          username: p.username,
          avatarId: p.avatarId,
          connected: p.connected,
          left: p.left,
          isHost: p.userId === room.hostUserId,
          score: p.score,
        })),
      round: inRound
        ? {
            number: room.roundNumber,
            total: room.settings.rounds,
            letter: room.phase === 'countdown' ? null : room.letter,
            categories: room.categories,
            endsAt: room.endsAt,
            bastaBy: room.bastaBy,
            myAnswers: me?.answers ?? {},
          }
        : null,
      nextAt: room.nextAt,
      lastResult: room.history[room.history.length - 1] ?? null,
      history: room.history,
      final: room.final
        ? {
            reason: room.final.reason,
            countsForStats: room.final.countsForStats,
            standings: room.final.standings,
            newAchievements: room.final.achievements[userId] ?? [],
          }
        : null,
      notice: room.notice,
    };
  }

  private broadcast(room: Room) {
    for (const p of room.players.values()) {
      if (p.connected) this.output.sendState(p.userId, this.snapshot(room, p.userId));
    }
  }
}
