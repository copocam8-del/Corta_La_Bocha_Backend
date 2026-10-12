import type { AnswerCheck, AnswerToCheck } from '../../tutti-frutti/tutti-frutti.service';
import type { AnswerStatus } from '../../tutti-frutti/scoring';
import type { UnlockedAchievement } from '../../achievements/achievements.service';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Tipos comunes del multijugador. El motor (game-engine.ts) maneja lo que es igual para todos los
// juegos: salas, lobby, anfitrión, entradas y salidas, reconexiones y el final de la partida
// (posiciones, estadísticas y logros una sola vez). Cada juego es un "modo" (modes/*.mode.ts) que
// decide cómo se juega una partida: rondas, reloj, acciones de los jugadores y puntos.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// Juegos que se pueden jugar en multijugador (el desafío del día es individual, no está acá)
export const MULTI_GAMES = ['tutti_frutti', 'ahorcado', 'trivia', 'sopa_de_letras', 'memotest'] as const;
export type MultiGameId = (typeof MULTI_GAMES)[number];
export const isMultiGame = (v: unknown): v is MultiGameId => typeof v === 'string' && (MULTI_GAMES as readonly string[]).includes(v);

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const COUNTDOWN_MS = 3_000; // "¡Preparados!" antes de cada ronda
export const COLLECT_MS = 2_000; // Tutti Frutti: al cortar la ronda, espera las últimas respuestas en viaje
export const RESULTS_MS = 10_000; // resultados de la ronda antes de la siguiente
export const LOBBY_GRACE_MS = 15_000; // en el lobby, cuánto se espera a alguien que se desconectó
export const HOST_GRACE_MS = 10_000; // si el anfitrión se desconecta, cuánto antes de pasarlo a otro
export const GAME_GRACE_MS = 20_000; // en partida: si quedan menos de 2 conectados, cuánto se espera
export const AUTOSTART_MS = 15_000; // salas de la cola pública: cuánto se espera a que entren todos

export type Phase = 'lobby' | 'countdown' | 'playing' | 'collecting' | 'validating' | 'results' | 'finished' | 'closed';
export const IN_GAME: Phase[] = ['countdown', 'playing', 'collecting', 'validating', 'results'];

// Configuración de la sala. Cada juego usa lo que necesita y valida sus opciones:
//   tematica  → temática (Tutti Frutti, sopa), categoría (trivia) o tema (memotest)
//   dificultad→ ahorcado, trivia, sopa y memotest (Tutti Frutti no tiene: no hay máquina)
//   rounds    → rondas, preguntas, palabras, grillas o tableros
//   seconds   → tiempo por ronda, por pregunta, por palabra, por grilla o por turno
export interface Settings {
  tematica: string;
  rounds: number;
  seconds: number;
  dificultad?: string;
}

export type Result = { ok: true; code?: string } | { ok: false; error: string };
export const fail = (error: string): Result => ({ ok: false, error });

export type QueueSize = 'pocos' | 'muchos';

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
  game?: MultiGameId; // salas viejas (antes de la migración): Tutti Frutti
  players: StoredPlayer[];
}

export type GameExtra = Record<string, number | boolean | string>;

export interface FinalPlayerResult {
  userId: string;
  points: number;
  won: boolean;
  abandoned: boolean;
  extra?: GameExtra; // datos de la partida para los logros del juego (ej. errores en el ahorcado)
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
  createRoom(isPrivate: boolean, userIds: string[], game?: MultiGameId): Promise<StoredRoom>;
  loadRoom(code: string): Promise<StoredRoom | null>;
  addPlayer(roomId: string, userId: string): Promise<StoredPlayer>;
  removePlayer(roomId: string, userId: string): Promise<void>;
  setRoomStatus(roomId: string, status: 'waiting' | 'playing' | 'closed'): Promise<void>;
  createMatch(roomId: string, settings: Settings, game?: MultiGameId): Promise<string>;
  createRound(matchId: string, roundNumber: number, letter: string): Promise<string>;
  saveRound(roundId: string, answers: SavedAnswer[]): Promise<void>;
  finishMatch(
    matchId: string,
    roomId: string,
    results: FinalPlayerResult[],
    countsForStats: boolean,
    game?: MultiGameId,
  ): Promise<Record<string, UnlockedAchievement[]>>;
}

export interface Validator {
  validateAnswers(letter: string, items: AnswerToCheck[]): Promise<Map<string, AnswerCheck>>;
}

// Un jugador visto desde un modo
export interface PlayerRef {
  userId: string;
  username: string;
  connected: boolean;
  roomPlayerId: string;
  joinedAt: number;
}

// Lo que el motor le da a cada modo para manejar SU partida (una por sala)
export interface ModeHost {
  readonly code: string;
  readonly matchId: string;
  readonly settings: Settings;
  getPhase(): Phase;
  setPhase(phase: Phase, nextAt?: number | null): void;
  // Jugadores que siguen en la partida (no abandonaron), en orden de llegada
  players(): PlayerRef[];
  player(userId: string): PlayerRef | undefined;
  // Un solo reloj por sala: programar uno nuevo cancela el anterior. La función corre en la fila de la sala.
  schedule(ms: number, fn: () => Promise<void> | void): void;
  cancelTimer(): void;
  // Trabajo lento (ej. la IA) FUERA de la fila de la sala; "then" vuelve a correr en la fila
  // (sólo si la sala sigue viva y es la misma partida)
  outside<T>(work: () => Promise<T>, then: (value: T) => Promise<void> | void): void;
  addScore(userId: string, points: number): void;
  broadcast(): void;
  // Termina la partida (se completaron todas las rondas)
  finish(): Promise<void>;
  log(msg: string): void;
}

export interface GameMode {
  start(): Promise<void>;
  // Lo que hace un jugador (responder, marcar una palabra, dar vuelta una carta…)
  action(userId: string, type: string, payload: unknown): Promise<Result>;
  // Parte del estado propia del juego, armada POR JUGADOR (nunca respuestas que no le toca ver)
  view(userId: string): object;
  roundsPlayed(): number;
  // false = la partida termina pero no cuenta (ej. la IA no pudo validar en Tutti Frutti)
  countsForStats(): boolean;
  extraFor?(userId: string): GameExtra | undefined;
  // Un jugador abandonó o se desconectó / volvió (ej. en el memotest pasa el turno)
  onPlayerGone?(userId: string, why: 'left' | 'disconnected'): Promise<void> | void;
  onPlayerBack?(userId: string): void;
}

export interface ModeDeps {
  store: RoomStore;
  validator: Validator;
}

export interface ModeDefinition {
  game: MultiGameId;
  maxPlayers: number;
  defaults: Settings;
  validSettings(s: Partial<Settings>): Settings | null;
  // Partida pública: configuración fija (choice = temática elegida, si el juego la usa)
  publicSettings(choice: string): Settings | null;
  queueSizes: QueueSize[];
  // Error si con esa configuración no se puede jugar (ej. pocas preguntas con ese filtro)
  cannotStart?(s: Settings): string | null;
  create(host: ModeHost, deps: ModeDeps): GameMode;
}

// Tabla de posiciones de una ronda o de la partida: mismo puntaje = misma posición
export function rank<T extends { points: number }>(rows: T[]): (T & { position: number })[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  let last: number | null = null;
  let position = 0;
  return sorted.map((r, i) => {
    if (r.points !== last) {
      position = i + 1;
      last = r.points;
    }
    return { ...r, position };
  });
}

export const pick = <T>(list: readonly T[], azar: () => number = Math.random): T => list[Math.floor(azar() * list.length)];
