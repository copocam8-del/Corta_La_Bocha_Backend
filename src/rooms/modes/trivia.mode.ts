import { CATEGORIAS_TRIVIA, type CategoriaTrivia, type DificultadTrivia } from '../../trivia/trivia-bank';
import { elegirPreguntas, GRACIA_MS, prepararPregunta, preguntaPorId, puntosRespuesta, type PreguntaEnJuego } from '../../trivia/trivia-rules';
import { RoundMode } from './round-mode';
import { fail, type GameExtra, type ModeDefinition, type Result, type Settings } from './types';

// Trivia multijugador: todos reciben la misma pregunta al mismo tiempo. Suma quien acierta (más
// cuanto más rápido) y el primero en acertar se lleva un bonus. Cada pregunta es una "ronda".
// La opción correcta NUNCA viaja antes de que termine la pregunta.

export const TRIVIA_PREGUNTAS = [5, 10, 15];
export const TRIVIA_SEGUNDOS = [10, 15, 20];
export const TRIVIA_DIFICULTADES = ['mezcla', 'facil', 'medio', 'dificil'];
export const BONUS_PRIMERO = 5;
const REVELAR_MS = 4_000; // cuánto se ve la respuesta correcta antes de la siguiente pregunta

const DEFAULTS: Settings = { tematica: 'todas', dificultad: 'mezcla', rounds: 10, seconds: 20 };

function validSettings(s: Partial<Settings>): Settings | null {
  const tematica = s.tematica ?? DEFAULTS.tematica;
  const dificultad = s.dificultad ?? DEFAULTS.dificultad!;
  const rounds = Number(s.rounds ?? DEFAULTS.rounds);
  const seconds = Number(s.seconds ?? DEFAULTS.seconds);
  if (tematica !== 'todas' && !(CATEGORIAS_TRIVIA as readonly string[]).includes(tematica)) return null;
  if (!TRIVIA_DIFICULTADES.includes(dificultad) || !TRIVIA_PREGUNTAS.includes(rounds) || !TRIVIA_SEGUNDOS.includes(seconds)) return null;
  return { tematica, dificultad, rounds, seconds };
}

const filtro = (s: Settings) => ({
  categoria: s.tematica === 'todas' ? undefined : (s.tematica as CategoriaTrivia),
  dificultad: s.dificultad === 'mezcla' ? undefined : (s.dificultad as DificultadTrivia),
});

interface Respuesta {
  opcion: number | null;
  ms: number;
  correcta: boolean;
  puntos: number;
}

class TriviaMode extends RoundMode {
  private preguntas: PreguntaEnJuego[] = [];
  private actual: PreguntaEnJuego | null = null;
  private respuestas = new Map<string, Respuesta>();
  private revelada: null | { numero: number; correcta: number; resultados: (Respuesta & { userId: string; username: string })[] } = null;
  private totales = new Map<string, { aciertos: number; ms: number; respondidas: number }>();

  protected countdownMs() {
    return this.roundNumber === 1 ? super.countdownMs() : 0; // sólo antes de la primera pregunta
  }
  protected resultsMs() {
    return REVELAR_MS;
  }
  protected graceMs() {
    return Math.min(GRACIA_MS, 1000);
  }

  protected prepareRound() {
    if (this.roundNumber === 1) {
      this.preguntas = elegirPreguntas(Math.random, filtro(this.host.settings), this.total).map((p) => prepararPregunta(p, Math.random));
    }
    this.actual = this.preguntas[this.roundNumber - 1] ?? null;
    this.respuestas = new Map();
    this.revelada = null;
  }

  protected get total() {
    return Math.min(this.host.settings.rounds, this.preguntas.length || this.host.settings.rounds);
  }

  protected everyoneDone() {
    return this.connected().every((p) => this.respuestas.has(p.userId));
  }

  async action(userId: string, type: string, payload: unknown): Promise<Result> {
    if (type !== 'answer') return fail('Acción inválida.');
    if (this.host.getPhase() !== 'playing' || !this.actual) return fail('La pregunta ya terminó.');
    if (this.respuestas.has(userId)) return fail('Ya respondiste esta pregunta.');
    const opcion = (payload as { opcion?: unknown })?.opcion ?? null;
    if (opcion !== null && (!Number.isInteger(opcion) || (opcion as number) < 0 || (opcion as number) >= this.actual.opciones.length)) {
      return fail('Opción inválida.');
    }
    // El tiempo lo mide el servidor
    const ms = Date.now() - this.startedAt;
    const limite = this.host.settings.seconds * 1000;
    const correcta = opcion === this.actual.correcta && ms <= limite + GRACIA_MS;
    const puntos = puntosRespuesta(preguntaPorId(this.actual.id).dificultad, correcta, ms, limite);
    this.respuestas.set(userId, { opcion: opcion as number | null, ms, correcta, puntos });
    await this.checkDone();
    return { ok: true };
  }

  protected closeRound() {
    if (!this.actual) return;
    // El primero en acertar se lleva un bonus
    const primero = [...this.respuestas.entries()].filter(([, r]) => r.correcta).sort((a, b) => a[1].ms - b[1].ms)[0];
    if (primero) primero[1].puntos += BONUS_PRIMERO;
    const resultados = this.host.players().map((p) => {
      const r = this.respuestas.get(p.userId) ?? { opcion: null, ms: this.host.settings.seconds * 1000, correcta: false, puntos: 0 };
      this.host.addScore(p.userId, r.puntos);
      const t = this.totales.get(p.userId) ?? { aciertos: 0, ms: 0, respondidas: 0 };
      this.totales.set(p.userId, { aciertos: t.aciertos + (r.correcta ? 1 : 0), ms: t.ms + r.ms, respondidas: t.respondidas + 1 });
      return { ...r, userId: p.userId, username: p.username };
    });
    this.revelada = { numero: this.roundNumber, correcta: this.actual.correcta, resultados };
  }

  extraFor(userId: string): GameExtra | undefined {
    const t = this.totales.get(userId);
    if (!t) return undefined;
    return { aciertos: t.aciertos, total: this.played, promedioSegundos: Math.round(t.ms / Math.max(1, t.respondidas) / 100) / 10 };
  }

  view(userId: string) {
    const p = this.actual ? preguntaPorId(this.actual.id) : null;
    const mia = this.respuestas.get(userId);
    return {
      view: {
        kind: 'trivia' as const,
        numero: this.roundNumber,
        total: this.total,
        segundos: this.host.settings.seconds,
        endsAt: this.endsAt,
        pregunta: p && this.actual && this.phaseShowsRound()
          ? { texto: p.texto, categoria: p.categoria, dificultad: p.dificultad, opciones: this.actual.opciones }
          : null,
        miRespuesta: mia ? mia.opcion : undefined,
        respondieron: [...this.respuestas.keys()],
        revelada: this.revelada,
      },
    };
  }
}

export const trivia: ModeDefinition = {
  game: 'trivia',
  maxPlayers: 8,
  defaults: DEFAULTS,
  validSettings,
  publicSettings: () => ({ ...DEFAULTS }),
  queueSizes: ['pocos', 'muchos'],
  cannotStart: (s) => {
    const hay = elegirPreguntas(Math.random, filtro(s), s.rounds).length;
    return hay < s.rounds ? `Con esa categoría y dificultad hay sólo ${hay} preguntas: elegí menos preguntas u otro filtro.` : null;
  },
  create: (host) => new TriviaMode(host),
};
