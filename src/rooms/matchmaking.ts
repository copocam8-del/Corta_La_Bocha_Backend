import { TEMATICAS } from '../solo-matches/solo-quick';
import type { Settings } from './game-engine';

// Cola pública: junta jugadores que eligieron la misma temática y tamaño de partida. Cuando hay
// el mínimo, arranca una cuenta regresiva (QUEUE_WAIT_MS) para que se sumen más; si se llena,
// arma la sala en el momento. Las partidas públicas son de PUBLIC_SETTINGS (rondas y tiempo fijos).

export const QUEUE_SIZES = {
  pocos: { min: 2, max: 4 },
  muchos: { min: 5, max: 8 },
} as const;
export type QueueSize = keyof typeof QUEUE_SIZES;

export const QUEUE_WAIT_MS = 10_000;
export const PUBLIC_ROUNDS = 3;
export const PUBLIC_SECONDS = 60;

export interface QueueEntry {
  userId: string;
  username: string;
}

export interface QueueState {
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
    private readonly createRoom: (userIds: string[], settings: Settings) => Promise<string>,
    private readonly output: QueueOutput,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  join(user: QueueEntry, tematica: string, size: string): { ok: true } | { ok: false; error: string } {
    if (!TEMATICAS[tematica]) return { ok: false, error: 'Temática inválida.' };
    if (!(size in QUEUE_SIZES)) return { ok: false, error: 'Cantidad de jugadores inválida.' };
    this.leave(user.userId); // si estaba en otra cola, sale
    const key = `${tematica}|${size}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tematica, size: size as QueueSize, entries: [], startsAt: null };
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
    const { min, max } = QUEUE_SIZES[bucket.size];
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
    const { min, max } = QUEUE_SIZES[bucket.size];
    if (bucket.entries.length < min) return this.broadcast(bucket);

    const group = bucket.entries.splice(0, max);
    for (const e of group) this.bucketOf.delete(e.userId);
    try {
      const code = await this.createRoom(
        group.map((e) => e.userId),
        { tematica: bucket.tematica, rounds: PUBLIC_ROUNDS, seconds: PUBLIC_SECONDS },
      );
      for (const e of group) this.output.sendMatched(e.userId, code);
    } catch (e) {
      this.log(`No se pudo armar la sala pública: ${e}`);
      // Vuelven a la cola, adelante de todo
      bucket.entries.unshift(...group);
      for (const g of group) this.bucketOf.set(g.userId, `${bucket.tematica}|${bucket.size}`);
    }
    this.update(bucket);
  }

  private broadcast(bucket: Bucket) {
    const { min, max } = QUEUE_SIZES[bucket.size];
    const state: QueueState = {
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
