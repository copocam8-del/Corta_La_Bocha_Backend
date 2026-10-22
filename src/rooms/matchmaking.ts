import { MODES } from './modes';
import { isMultiGame, minPlayersOf, type MultiGameId, type Settings } from './modes/types';

// Cola pública: junta jugadores que eligieron el mismo juego, la misma temática (en Tutti Frutti)
// y el mismo tamaño de partida. Cuando hay el mínimo, arranca una cuenta regresiva (QUEUE_WAIT_MS)
// para que se sumen más; si se llena, arma la sala en el momento. Las partidas públicas tienen una
// configuración fija por juego (publicSettings de cada modo: en Tutti Frutti, 3 rondas de 60 s).
// El mínimo de cada grupo nunca es menor que el del juego (queueLimits).

export const QUEUE_SIZES = {
  pocos: { min: 2, max: 4 },
  muchos: { min: 5, max: 8 },
} as const;
export type QueueSize = keyof typeof QUEUE_SIZES;

// Límites de cada grupo: los de QUEUE_SIZES, pero nunca menos que el mínimo del juego
// (El Impostor: pocos = 3–4, muchos = 5–8)
export function queueLimits(game: MultiGameId, size: QueueSize) {
  const { min, max } = QUEUE_SIZES[size];
  return { min: Math.max(min, minPlayersOf(MODES[game])), max };
}

export const QUEUE_WAIT_MS = 10_000;
export { PUBLIC_ROUNDS, PUBLIC_SECONDS } from './modes/tutti-frutti.mode';

export interface QueueEntry {
  userId: string;
  username: string;
}

export interface QueueState {
  game: MultiGameId;
  tematica: string;
  size: QueueSize;
  min: number;
  max: number;
  players: string[]; // nombres
  startsAt: number | null;
  serverNow: number;
}

export interface QueueOutput {
  sendQueueState(userId: string, state: QueueState): void;
  sendMatched(userId: string, code: string): void;
}

interface Bucket {
  game: MultiGameId;
  tematica: string;
  size: QueueSize;
  entries: QueueEntry[];
  startsAt: number | null;
  timer?: NodeJS.Timeout;
}

export class Matchmaking {
  private readonly buckets = new Map<string, Bucket>();
  private readonly bucketOf = new Map<string, string>(); // userId → clave del grupo

  constructor(
    private readonly createRoom: (userIds: string[], settings: Settings, game: MultiGameId) => Promise<string>,
    private readonly output: QueueOutput,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  // Cuántos esperan en la cola pública ahora (para el panel de administración)
  get waiting(): number {
    return this.bucketOf.size;
  }

  join(user: QueueEntry, tematica: string, size: string, game: string = 'tutti_frutti'): { ok: true } | { ok: false; error: string } {
    if (!isMultiGame(game)) return { ok: false, error: 'Juego inválido.' };
    const def = MODES[game];
    // Sólo Tutti Frutti separa la cola por temática; en los demás la configuración pública es fija
    if (game !== 'tutti_frutti') tematica = '';
    else if (!def.publicSettings(tematica)) return { ok: false, error: 'Temática inválida.' };
    if (!(size in QUEUE_SIZES) || !def.queueSizes.includes(size as QueueSize)) return { ok: false, error: 'Cantidad de jugadores inválida.' };
    this.leave(user.userId); // si estaba en otra cola, sale
    const key = `${game}|${tematica}|${size}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { game, tematica, size: size as QueueSize, entries: [], startsAt: null };
      this.buckets.set(key, bucket);
    }
    bucket.entries.push(user);
    this.bucketOf.set(user.userId, key);
    this.update(bucket);
    return { ok: true };
  }

  leave(userId: string) {
    const key = this.bucketOf.get(userId);
    if (!key) return;
    this.bucketOf.delete(userId);
    const bucket = this.buckets.get(key);
    if (!bucket) return;
    bucket.entries = bucket.entries.filter((e) => e.userId !== userId);
    this.update(bucket);
  }

  isQueued(userId: string) {
    return this.bucketOf.has(userId);
  }

  private update(bucket: Bucket) {
    const { min, max } = queueLimits(bucket.game, bucket.size);
    if (bucket.entries.length >= max) {
      void this.form(bucket);
      return;
    }
    if (bucket.entries.length >= min && !bucket.timer) {
      bucket.startsAt = Date.now() + QUEUE_WAIT_MS;
      bucket.timer = setTimeout(() => void this.form(bucket), QUEUE_WAIT_MS);
    } else if (bucket.entries.length < min && bucket.timer) {
      clearTimeout(bucket.timer);
      bucket.timer = undefined;
      bucket.startsAt = null;
    }
    this.broadcast(bucket);
  }

  private async form(bucket: Bucket) {
    if (bucket.timer) clearTimeout(bucket.timer);
    bucket.timer = undefined;
    bucket.startsAt = null;
    const { min, max } = queueLimits(bucket.game, bucket.size);
    if (bucket.entries.length < min) return this.broadcast(bucket);

    const group = bucket.entries.splice(0, max);
    for (const e of group) this.bucketOf.delete(e.userId);
    try {
      const code = await this.createRoom(
        group.map((e) => e.userId),
        MODES[bucket.game].publicSettings(bucket.tematica)!,
        bucket.game,
      );
      for (const e of group) this.output.sendMatched(e.userId, code);
    } catch (e) {
      this.log(`No se pudo armar la sala pública: ${e}`);
      // Vuelven a la cola, adelante de todo
      bucket.entries.unshift(...group);
      for (const g of group) this.bucketOf.set(g.userId, `${bucket.game}|${bucket.tematica}|${bucket.size}`);
    }
    this.update(bucket);
  }

  private broadcast(bucket: Bucket) {
    const { min, max } = queueLimits(bucket.game, bucket.size);
    const state: QueueState = {
      game: bucket.game,
      tematica: bucket.tematica,
      size: bucket.size,
      min,
      max,
      players: bucket.entries.map((e) => e.username),
      startsAt: bucket.startsAt,
      serverNow: Date.now(),
    };
    for (const e of bucket.entries) this.output.sendQueueState(e.userId, state);
  }
}
