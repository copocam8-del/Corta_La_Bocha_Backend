import { scoreRound, type AnswerStatus, type CategoryEntry } from '../../tutti-frutti/scoring';
import { LETRAS, TEMATICAS, letrasDe } from '../../solo-matches/solo-quick';
import type { AnswerCheck, AnswerToCheck } from '../../tutti-frutti/tutti-frutti.service';
import { contieneOfensivo, TEXTO_OCULTO } from '../../moderacion/filtro';
import {
  COLLECT_MS, COUNTDOWN_MS, fail, RESULTS_MS,
  type GameMode, type ModeDefinition, type ModeDeps, type ModeHost, type PlayerRef, type Result, type Settings,
} from './types';

// Tutti Frutti multijugador. El servidor sortea letra y categorías, controla el reloj y el ¡Basta!,
// junta las respuestas, las valida (UNA llamada a la IA por ronda para todos) y puntúa con scoring.ts.

export const ROUND_OPTIONS = [1, 3, 5];
export const SECONDS_OPTIONS = [30, 45, 60, 90, 120];
export const DEFAULT_SETTINGS: Settings = { tematica: 'general', rounds: 3, seconds: 60 };
export const MAX_ANSWER_LENGTH = 150;
export const PUBLIC_ROUNDS = 3;
export const PUBLIC_SECONDS = 60;

export interface CellResult {
  userId: string;
  username: string;
  answer: string | null;
  status: AnswerStatus;
  canonical: string | null;
  reason: string;
  points: number;
  ofensiva: boolean; // no vale y los demás la ven como "***" (el que la escribió ve la suya)
}

export interface RoundResult {
  number: number;
  letter: string;
  bastaBy: string | null; // nombre de quien cantó ¡Basta! (null si se acabó el tiempo)
  incomplete: boolean; // la IA no pudo validar alguna respuesta (0 puntos)
  categories: { category: string; entries: CellResult[] }[];
  roundPoints: Record<string, number>;
}

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

class TuttiFruttiMode implements GameMode {
  private roundNumber = 0;
  private roundId: string | null = null;
  private letter: string | null = null;
  private categories: string[] = [];
  private endsAt: number | null = null;
  private bastaBy: string | null = null;
  private usedLetters: string[] = [];
  private history: RoundResult[] = [];
  private incomplete = false;
  private answers = new Map<string, Record<string, string>>();
  private finalSent = new Set<string>();

  constructor(
    private readonly host: ModeHost,
    private readonly deps: ModeDeps,
  ) {}

  async start() {
    this.beginCountdown();
  }

  roundsPlayed() {
    return this.history.length;
  }

  countsForStats() {
    return !this.incomplete;
  }

  async action(userId: string, type: string, payload: unknown): Promise<Result> {
    const body = (payload ?? {}) as { answers?: unknown; final?: boolean };
    if (type === 'answers') return this.saveAnswers(userId, body.answers, body.final === true);
    if (type === 'basta') return this.basta(userId, body.answers);
    return fail('Acción inválida.');
  }

  // Borrador de respuestas (el cliente lo manda mientras escribe). final = ya cortó la ronda.
  private async saveAnswers(userId: string, raw: unknown, final: boolean): Promise<Result> {
    const phase = this.host.getPhase();
    if (phase !== 'playing' && phase !== 'collecting') return { ok: true }; // llegó tarde: se ignora
    this.answers.set(userId, cleanAnswers(raw, this.categories));
    if (phase === 'collecting' && final) {
      this.finalSent.add(userId);
      if (this.host.players().filter((x) => x.connected).every((x) => this.finalSent.has(x.userId))) await this.validateRound();
    }
    return { ok: true };
  }

  private basta(userId: string, raw: unknown): Result {
    if (this.host.getPhase() !== 'playing') return fail('La ronda ya terminó.');
    const answers = cleanAnswers(raw, this.categories);
    if (this.categories.some((c) => !(answers[c] ?? '').trim())) {
      return fail('Para cantar ¡Basta! tenés que completar todas las categorías.');
    }
    this.answers.set(userId, answers);
    this.finalSent.add(userId);
    this.endRound(userId);
    return { ok: true };
  }

  private beginCountdown() {
    const { settings } = this.host;
    this.roundNumber += 1;
    const pool = letrasDe(settings.tematica).filter((l) => !this.usedLetters.includes(l));
    const letters = pool.length ? pool : letrasDe(settings.tematica).length ? letrasDe(settings.tematica) : LETRAS;
    this.letter = letters[Math.floor(Math.random() * letters.length)];
    this.usedLetters.push(this.letter);
    this.categories = TEMATICAS[settings.tematica];
    this.bastaBy = null;
    this.endsAt = null;
    this.answers.clear();
    this.finalSent.clear();
    this.host.setPhase('countdown', Date.now() + COUNTDOWN_MS);
    this.host.broadcast();
    this.host.schedule(COUNTDOWN_MS, () => this.beginRound());
  }

  private async beginRound() {
    if (this.host.getPhase() !== 'countdown' || !this.letter) return;
    this.roundId = await this.deps.store.createRound(this.host.matchId, this.roundNumber, this.letter);
    this.host.setPhase('playing', null);
    this.endsAt = Date.now() + this.host.settings.seconds * 1000;
    this.host.broadcast();
    this.host.schedule(this.host.settings.seconds * 1000, () => this.endRound(null));
  }

  // Corta la ronda para todos (por tiempo o porque alguien cantó ¡Basta!)
  private endRound(bastaUserId: string | null) {
    if (this.host.getPhase() !== 'playing') return;
    this.host.setPhase('collecting', null);
    this.bastaBy = bastaUserId ? (this.host.player(bastaUserId)?.username ?? null) : null;
    this.endsAt = null;
    this.host.broadcast();
    this.host.schedule(COLLECT_MS, () => this.validateRound());
  }

  private async validateRound() {
    if (this.host.getPhase() !== 'collecting') return;
    this.host.setPhase('validating', null);
    this.host.cancelTimer(); // ya no hace falta esperar más respuestas
    this.host.broadcast();

    const roundId = this.roundId;
    const letter = this.letter!;
    const participants = this.host.players();
    const items: AnswerToCheck[] = [];
    for (const p of participants) {
      const mine = this.answers.get(p.userId) ?? {};
      for (const c of this.categories) items.push({ key: `${p.userId}::${c}`, category: c, answer: (mine[c] ?? '').trim() || null });
    }

    // La IA puede tardar: la llamada se hace FUERA de la fila de la sala (así se puede seguir
    // entrando, saliendo y reconectando mientras tanto). Después se vuelve a la fila.
    this.host.outside(
      async () => {
        try {
          return await this.deps.validator.validateAnswers(letter, items);
        } catch (e) {
          this.host.log(`Validación de la ronda falló: ${e}`);
          return new Map<string, AnswerCheck>();
        }
      },
      (checks) => this.applyResults(roundId, participants, checks),
    );
  }

  private async applyResults(roundId: string | null, todos: PlayerRef[], checks: Map<string, AnswerCheck>) {
    if (this.host.getPhase() !== 'validating' || this.roundId !== roundId) return;
    // Si alguien borró su cuenta mientras validaba la IA, ya no está en la sala: sus respuestas no se guardan
    const participants = todos.filter((p) => this.host.player(p.userId));
    const categories = this.categories;
    const answerOf = (p: PlayerRef, c: string) => (this.answers.get(p.userId)?.[c] ?? '').trim() || null;
    const checkOf = (p: PlayerRef, c: string): AnswerCheck =>
      checks.get(`${p.userId}::${c}`) ?? { status: 'unverified', canonical: null, reason: 'No se pudo validar (la IA no respondió). No suma puntos.' };

    const byCategory: Record<string, CategoryEntry[]> = {};
    for (const c of categories) {
      byCategory[c] = participants.map((p) => {
        const ch = checkOf(p, c);
        return { playerId: p.userId, status: ch.status, canonical: ch.canonical ?? answerOf(p, c) };
      });
    }
    const scores = scoreRound(byCategory);

    const result: RoundResult = {
      number: this.roundNumber,
      letter: this.letter!,
      bastaBy: this.bastaBy,
      incomplete: false,
      categories: categories.map((c) => ({
        category: c,
        entries: participants.map((p) => {
          const ch = checkOf(p, c);
          return {
            userId: p.userId,
            username: p.username,
            answer: answerOf(p, c),
            status: ch.status,
            canonical: ch.canonical,
            reason: ch.reason,
            points: scores[p.userId]?.byCategory[c] ?? 0,
            ofensiva: contieneOfensivo(answerOf(p, c)),
          };
        }),
      })),
      roundPoints: Object.fromEntries(participants.map((p) => [p.userId, scores[p.userId]?.total ?? 0])),
    };
    result.incomplete = result.categories.some((c) => c.entries.some((e) => e.status === 'unverified'));
    this.incomplete ||= result.incomplete;
    for (const p of participants) this.host.addScore(p.userId, result.roundPoints[p.userId] ?? 0);
    this.history.push(result);

    if (roundId) {
      const rpOf = new Map(participants.map((p) => [p.userId, p.roomPlayerId]));
      await this.deps.store
        .saveRound(
          roundId,
          result.categories.flatMap((c) =>
            c.entries.map((e) => ({
              roomPlayerId: rpOf.get(e.userId)!,
              category: c.category,
              answer: e.answer,
              status: e.status,
              points: e.points,
            })),
          ),
        )
        .catch((e) => this.host.log(`saveRound: ${e}`));
    }

    if (this.roundNumber >= this.host.settings.rounds) {
      await this.host.finish();
      return;
    }
    this.host.setPhase('results', Date.now() + RESULTS_MS);
    this.host.broadcast();
    this.host.schedule(RESULTS_MS, () => {
      if (this.host.getPhase() === 'results') this.beginCountdown();
    });
  }

  // Resultados como los ve cada jugador: las respuestas ofensivas de los demás, tapadas
  private resultFor(r: RoundResult, userId: string): RoundResult {
    if (!r.categories.some((c) => c.entries.some((e) => e.ofensiva && e.userId !== userId))) return r;
    return {
      ...r,
      categories: r.categories.map((c) => ({
        ...c,
        entries: c.entries.map((e) => (e.ofensiva && e.userId !== userId ? { ...e, answer: TEXTO_OCULTO, canonical: null } : e)),
      })),
    };
  }

  view(userId: string) {
    const phase = this.host.getPhase();
    const history = this.history.map((r) => this.resultFor(r, userId));
    const inRound = ['countdown', 'playing', 'collecting', 'validating'].includes(phase);
    return {
      round: inRound
        ? {
            number: this.roundNumber,
            total: this.host.settings.rounds,
            letter: phase === 'countdown' ? null : this.letter,
            categories: this.categories,
            endsAt: this.endsAt,
            bastaBy: this.bastaBy,
            myAnswers: this.answers.get(userId) ?? {},
          }
        : null,
      lastResult: history[history.length - 1] ?? null,
      history,
    };
  }
}

export const tuttiFrutti: ModeDefinition = {
  game: 'tutti_frutti',
  maxPlayers: 8,
  defaults: DEFAULT_SETTINGS,
  validSettings,
  publicSettings: (tematica) => (TEMATICAS[tematica] ? { tematica, rounds: PUBLIC_ROUNDS, seconds: PUBLIC_SECONDS } : null),
  queueSizes: ['pocos', 'muchos'],
  create: (host, deps) => new TuttiFruttiMode(host, deps),
};
