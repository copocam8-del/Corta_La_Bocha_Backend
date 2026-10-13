import type { UnlockedAchievement } from '../achievements/achievements.service';
import { MODES } from './modes';
import {
  AUTOSTART_MS, fail, GAME_GRACE_MS, HOST_GRACE_MS, IN_GAME, LOBBY_GRACE_MS, MIN_PLAYERS,
  type GameMode, type LectorVistos, type MatchOutcome, type ModeHost, type MultiGameId, type Phase, type PlayerRef, type Result, type RoomStore,
  type Settings, type StoredPlayer, type StoredRoom, type Validator,
} from './modes/types';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Motor del multijugador. El SERVIDOR manda en todo. Acá está lo común a todos los juegos: salas,
// lobby, anfitrión, entradas y salidas, reconexiones y el final de la partida (posiciones,
// estadísticas y logros, una sola vez). Cómo se juega cada partida lo decide el modo de cada juego
// (modes/*.mode.ts): Tutti Frutti, ahorcado, trivia, sopa de letras y memotest. Los clientes sólo
// muestran el estado que reciben ("room:state", armado por jugador) y mandan lo que hace cada uno.
//
// El estado de cada sala vive en memoria (alcanza con una sola instancia en Render). En la base
// quedan la sala (y de qué juego es), sus jugadores, la partida y, en Tutti Frutti, las rondas y
// respuestas; al final, las estadísticas y logros. Si el servidor se reinicia, las partidas en
// curso se pierden y las salas vuelven al lobby.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export * from './modes/types';
export {
  DEFAULT_SETTINGS, MAX_ANSWER_LENGTH, ROUND_OPTIONS, SECONDS_OPTIONS, validSettings,
  type CellResult, type RoundResult,
} from './modes/tutti-frutti.mode';

// Cómo el motor les habla a los jugadores (lo implementa el gateway de Socket.IO)
export interface EngineOutput {
  sendState(userId: string, state: RoomSnapshot): void;
}

export interface FinalResult {
  reason: 'completed' | 'not_enough_players';
  countsForStats: boolean;
  standings: {
    userId: string; username: string; points: number; position: number;
    won: boolean; result: MatchOutcome; abandoned: boolean;
  }[];
  // Empate en el primer puesto: nadie gana y se muestra "¡Empate!" con los nombres de los empatados
  empate: boolean;
  empatados: string[];
  newAchievements: UnlockedAchievement[]; // sólo los del jugador que recibe el estado
}

export interface RoomSnapshot {
  code: string;
  game: MultiGameId;
  isPrivate: boolean;
  me: string;
  hostUserId: string | null;
  phase: Phase;
  settings: Settings;
  minPlayers: number;
  maxPlayers: number;
  serverNow: number; // para que el cliente corrija la diferencia de reloj
  players: { userId: string; username: string; avatarId: string | null; connected: boolean; left: boolean; isHost: boolean; score: number }[];
  nextAt: number | null; // cuándo empieza la próxima fase (cuenta regresiva, resultados)
  // Tutti Frutti
  round: null | {
    number: number;
    total: number;
    letter: string | null; // null durante la cuenta regresiva
    categories: string[];
    endsAt: number | null;
    bastaBy: string | null;
    myAnswers: Record<string, string>;
  };
  lastResult: import('./modes/tutti-frutti.mode').RoundResult | null;
  history: import('./modes/tutti-frutti.mode').RoundResult[];
  // Los demás juegos: lo que ve este jugador de la partida (lo arma cada modo; nunca las respuestas)
  view: ({ kind: string } & Record<string, unknown>) | null;
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
  timer?: NodeJS.Timeout;
}

interface Room {
  code: string;
  roomId: string;
  game: MultiGameId;
  isPrivate: boolean;
  hostUserId: string | null;
  players: Map<string, Player>;
  settings: Settings;
  phase: Phase;
  matchId: string | null;
  epoch: number; // número de partida en la sala (para ignorar relojes de una partida vieja)
  mode: GameMode | null;
  nextAt: number | null;
  final: (Omit<FinalResult, 'newAchievements'> & { achievements: Record<string, UnlockedAchievement[]> }) | null;
  notice: string | null;
  phaseTimer?: NodeJS.Timeout;
  lowPlayersTimer?: NodeJS.Timeout;
  autoStartTimer?: NodeJS.Timeout;
  autoStart: boolean;
}

export class GameEngine {
  private readonly rooms = new Map<string, Room>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: RoomStore,
    private readonly validator: Validator,
    private readonly output: EngineOutput,
    private readonly log: (msg: string) => void = () => {},
    private readonly vistos?: LectorVistos,
  ) {}

  // Todo lo que toca una sala pasa en fila (una cosa por vez), así dos eventos simultáneos no se pisan
  private withLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(code) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(code, next.catch(() => undefined));
    return next;
  }

  // ── Crear y entrar ────────────────────────────────────────────────────────────────────────

  async createPrivateRoom(userId: string, settings: Partial<Settings>, game: MultiGameId = 'tutti_frutti'): Promise<Result> {
    const def = MODES[game];
    if (!def) return fail('Juego inválido.');
    const s = def.validSettings(settings);
    if (!s) return fail('Configuración inválida.');
    const stored = await this.store.createRoom(true, [userId], game);
    const room = this.fromStored({ ...stored, game }, s);
    room.hostUserId = userId;
    this.rooms.set(room.code, room);
    return { ok: true, code: room.code };
  }

  // Sala armada por la cola pública: arranca sola cuando entran todos (o a los AUTOSTART_MS)
  async createQueueRoom(userIds: string[], settings: Settings, game: MultiGameId = 'tutti_frutti'): Promise<string> {
    const stored = await this.store.createRoom(false, userIds, game);
    const room = this.fromStored({ ...stored, game }, settings);
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
        room = this.fromStored(stored);
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
        if (IN_GAME.includes(room.phase)) room.mode?.onPlayerBack?.(existing.userId);
        if (room.autoStart) await this.autoStart(room, false);
        this.broadcast(room);
        return { ok: true, code };
      }

      if (room.phase !== 'lobby') return fail('La partida ya empezó.');
      if (!room.isPrivate) return fail('Esta sala es de la cola pública: entrá por "Partida pública".');
      if ([...room.players.values()].filter((p) => !p.left).length >= MODES[room.game].maxPlayers) return fail('La sala está llena.');
      const stored = await this.store.addPlayer(room.roomId, user.userId);
      room.players.set(user.userId, this.newPlayer(stored, true));
      if (!room.hostUserId) room.hostUserId = user.userId;
      this.broadcast(room);
      return { ok: true, code };
    });
  }

  // El jugador se fue a propósito (botón "Volver" / "Salir"): en partida, cuenta como abandono y se avisa a los demás
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
        await room.mode?.onPlayerGone?.(userId, 'left');
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
        await room.mode?.onPlayerGone?.(userId, 'disconnected');
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
      const s = MODES[room.game].validSettings({ ...room.settings, ...settings });
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
      const problem = MODES[room.game].cannotStart?.(room.settings);
      if (problem) return fail(problem);
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
      room.mode = null;
      room.notice = null;
      for (const p of room.players.values()) p.score = 0;
      this.broadcast(room);
      return { ok: true };
    });
  }

  // ── Durante la partida ────────────────────────────────────────────────────────────────────

  // Lo que hace un jugador en la partida (responder, arriesgar una letra, marcar una palabra…)
  action(code: string, userId: string, type: string, payload: unknown): Promise<Result> {
    return this.withLock(code, async () => {
      const room = this.rooms.get(code);
      const p = room?.players.get(userId);
      if (!room || !p || p.left) return fail('No estás en esta partida.');
      if (!room.mode) return fail('La partida no empezó.');
      return room.mode.action(userId, String(type ?? ''), payload);
    });
  }

  // Tutti Frutti: borrador de respuestas (final = ya cortó la ronda) y ¡Basta!
  answers(code: string, userId: string, raw: unknown, final = false): Promise<Result> {
    return this.action(code, userId, 'answers', { answers: raw, final });
  }

  basta(code: string, userId: string, raw: unknown): Promise<Result> {
    return this.action(code, userId, 'basta', { answers: raw });
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

  private fromStored(stored: StoredRoom, settings?: Settings): Room {
    const game: MultiGameId = stored.game && MODES[stored.game] ? stored.game : 'tutti_frutti';
    const players = new Map<string, Player>();
    for (const sp of stored.players) players.set(sp.userId, this.newPlayer(sp, false));
    const first = [...players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    return {
      code: stored.code,
      roomId: stored.roomId,
      game,
      isPrivate: stored.isPrivate,
      hostUserId: first?.userId ?? null,
      players,
      settings: settings ?? { ...MODES[game].defaults },
      phase: 'lobby',
      matchId: null,
      epoch: 0,
      mode: null,
      nextAt: null,
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
    const matchId = await this.store.createMatch(room.roomId, room.settings, room.game);
    room.matchId = matchId;
    await this.store.setRoomStatus(room.roomId, 'playing');
    room.epoch += 1;
    room.final = null;
    room.notice = null;
    for (const p of room.players.values()) p.score = 0;
    room.mode = MODES[room.game].create(this.hostFor(room, matchId), { store: this.store, validator: this.validator, vistos: this.vistos });
    await room.mode.start();
  }

  // Lo que puede hacer el modo de juego con SU partida. Si la sala ya no existe o empezó otra
  // partida, los relojes y respuestas viejas se ignoran.
  private hostFor(room: Room, matchId: string): ModeHost {
    const epoch = room.epoch;
    const alive = () => this.rooms.get(room.code) === room && room.epoch === epoch;
    const ref = (p: Player): PlayerRef => ({
      userId: p.userId,
      username: p.username,
      connected: p.connected,
      roomPlayerId: p.roomPlayerId,
      joinedAt: p.joinedAt,
    });
    return {
      code: room.code,
      matchId,
      settings: room.settings,
      getPhase: () => room.phase,
      setPhase: (phase, nextAt) => {
        room.phase = phase;
        if (nextAt !== undefined) room.nextAt = nextAt;
      },
      players: () => this.activePlayers(room).sort((a, b) => a.joinedAt - b.joinedAt).map(ref),
      player: (userId) => {
        const p = room.players.get(userId);
        return p ? ref(p) : undefined;
      },
      schedule: (ms, fn) => {
        if (room.phaseTimer) clearTimeout(room.phaseTimer);
        room.phaseTimer = setTimeout(() => void this.withLock(room.code, async () => {
          if (alive()) await fn();
        }), ms);
      },
      cancelTimer: () => {
        if (room.phaseTimer) clearTimeout(room.phaseTimer);
        room.phaseTimer = undefined;
      },
      outside: (work, then) => {
        void (async () => {
          let value: Awaited<ReturnType<typeof work>>;
          try {
            value = await work();
          } catch (e) {
            this.log(`Trabajo de la partida falló: ${e}`);
            return;
          }
          await this.withLock(room.code, async () => {
            if (alive()) await then(value);
          });
        })();
      },
      addScore: (userId, points) => {
        const p = room.players.get(userId);
        if (p) p.score += Math.max(0, Math.round(points));
      },
      broadcast: () => {
        if (alive()) this.broadcast(room);
      },
      finish: () => this.finishMatch(room, 'completed'),
      log: (msg) => this.log(msg),
    };
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
    room.nextAt = null;

    const everyone = [...room.players.values()];
    const best = Math.max(0, ...everyone.filter((p) => !p.left).map((p) => p.score));
    // Arriba: los que no abandonaron con los puntos más altos (si nadie sumó, nadie gana). Si son
    // dos o más es EMPATE: nadie gana (ni estadísticas de victoria, ni racha, ni logros de ganar).
    const arriba = new Set(everyone.filter((p) => !p.left && best > 0 && p.score === best).map((p) => p.userId));
    const empate = arriba.size >= 2;
    const outcomeOf = (userId: string): MatchOutcome => (!arriba.has(userId) ? 'loss' : empate ? 'draw' : 'win');
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
        won: outcomeOf(p.userId) === 'win',
        result: outcomeOf(p.userId),
        abandoned: p.left,
      };
    });
    // Cuenta para estadísticas si se jugó al menos una ronda (y, en Tutti Frutti, la IA validó todo)
    const mode = room.mode;
    const countsForStats = !!mode && mode.roundsPlayed() > 0 && mode.countsForStats();

    let achievements: Record<string, UnlockedAchievement[]> = {};
    if (matchId) {
      try {
        achievements = await this.store.finishMatch(
          matchId,
          room.roomId,
          standings.map((s) => ({
            userId: s.userId,
            points: s.points,
            won: s.won,
            result: s.result,
            abandoned: s.abandoned,
            ...(mode?.extraFor?.(s.userId) ? { extra: mode.extraFor(s.userId) } : {}),
          })),
          countsForStats,
          room.game,
        );
      } catch (e) {
        this.log(`finishMatch: ${e}`);
      }
    }
    const empatados = empate ? standings.filter((s) => s.result === 'draw').map((s) => s.username) : [];
    room.final = { reason, countsForStats, standings, empate, empatados, achievements };
    room.notice = reason === 'not_enough_players' ? 'La partida terminó porque quedaron menos de 2 jugadores.' : null;
    this.broadcast(room);
  }

  private snapshot(room: Room, userId: string): RoomSnapshot {
    return {
      code: room.code,
      game: room.game,
      isPrivate: room.isPrivate,
      me: userId,
      hostUserId: room.hostUserId,
      phase: room.phase,
      settings: room.settings,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MODES[room.game].maxPlayers,
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
      nextAt: room.nextAt,
      round: null,
      lastResult: null,
      history: [],
      view: null,
      ...((room.mode?.view(userId) ?? {}) as Partial<RoomSnapshot>),
      final: room.final
        ? {
            reason: room.final.reason,
            countsForStats: room.final.countsForStats,
            standings: room.final.standings,
            empate: room.final.empate,
            empatados: room.final.empatados,
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
