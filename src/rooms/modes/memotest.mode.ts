import { armarMazo, NIVELES_MEMOTEST, TEMAS_MEMOTEST, type Carta, type NivelMemotest, type TemaMemotest } from '../../memotest/memotest-rules';
import { RoundMode } from './round-mode';
import { fail, pick, type ModeDefinition, type Result, type Settings } from './types';

// Memotest multijugador: por turnos sobre el MISMO tablero. En tu turno das vuelta dos cartas
// (todos las ven): si son par, te lo llevás y seguís jugando; si no, se tapan y le toca al
// siguiente. Gana quien junta más pares. El mazo queda en el servidor: sólo viajan las cartas que
// están boca arriba.

export const MEMOTEST_TABLEROS = [1, 2, 3];
export const MEMOTEST_SEGUNDOS = [10, 15, 20]; // por turno
export const MEMOTEST_NIVELES: NivelMemotest[] = ['facil', 'medio', 'dificil'];
export const MEMOTEST_MAX_JUGADORES = 4; // por turnos, con más se hace muy largo
export const PUNTOS_PAR = 10;
export const MOSTRAR_MS = 1_500; // cuánto se ven dos cartas que no son par antes de taparse
export const TOPE_TABLERO_MS = 10 * 60_000; // si nadie juega, el tablero no dura para siempre

const DEFAULTS: Settings = { tematica: 'clubes_apodos', dificultad: 'facil', rounds: 1, seconds: 15 };

function validSettings(s: Partial<Settings>): Settings | null {
  const tematica = s.tematica ?? DEFAULTS.tematica;
  const dificultad = (s.dificultad ?? DEFAULTS.dificultad) as NivelMemotest;
  const rounds = Number(s.rounds ?? DEFAULTS.rounds);
  const seconds = Number(s.seconds ?? DEFAULTS.seconds);
  if (!(tematica in TEMAS_MEMOTEST) || !MEMOTEST_NIVELES.includes(dificultad)) return null;
  if (!MEMOTEST_TABLEROS.includes(rounds) || !MEMOTEST_SEGUNDOS.includes(seconds)) return null;
  return { tematica, dificultad, rounds, seconds };
}

class MemotestMode extends RoundMode {
  private mazo: Carta[] = [];
  private encontrados = new Map<number, string>(); // par → userId
  private abiertas: number[] = []; // cartas boca arriba del turno actual (0, 1 o 2)
  private turno: string | null = null;
  private turnoHasta: number | null = null;
  private mostrando = false; // dos cartas que no son par a la vista: nadie puede jugar
  private tope = 0;
  private orden: string[] = []; // orden de los turnos (orden de llegada a la sala)
  private revelada: null | { numero: number; paresPor: Record<string, number> } = null;

  private get nivel() {
    return this.host.settings.dificultad as NivelMemotest;
  }

  private get pares() {
    return NIVELES_MEMOTEST[this.nivel].pares;
  }

  // Sin reloj de ronda: el reloj es por turno
  protected roundMs() {
    return null;
  }

  protected prepareRound() {
    this.mazo = armarMazo(this.host.settings.tematica as TemaMemotest, this.nivel, Math.random);
    this.encontrados = new Map();
    this.abiertas = [];
    this.turno = null;
    this.turnoHasta = null;
    this.mostrando = false;
    this.revelada = null;
  }

  protected onPlaying() {
    this.tope = Date.now() + TOPE_TABLERO_MS;
    this.orden = this.host.players().map((p) => p.userId);
    // Arranca uno distinto en cada tablero
    const conectados = this.connected();
    this.darTurno(conectados.length ? conectados[(this.roundNumber - 1) % conectados.length].userId : null);
  }

  protected everyoneDone() {
    return this.encontrados.size === this.pares;
  }

  private darTurno(userId: string | null) {
    this.abiertas = [];
    this.mostrando = false;
    this.turno = userId;
    const ms = this.host.settings.seconds * 1000;
    this.turnoHasta = userId ? Date.now() + ms : null;
    if (userId) this.host.schedule(ms + 500, () => this.siguiente());
  }

  // Pasa el turno al siguiente conectado (en orden de llegada)
  private async siguiente() {
    if (this.host.getPhase() !== 'playing') return;
    if (Date.now() > this.tope) {
      await this.endRound();
      return;
    }
    // El orden es el de la ronda (así funciona aunque el que tenía el turno ya no esté en la partida)
    const orden = this.orden;
    const i = orden.indexOf(this.turno ?? '');
    const enJuego = new Set(this.connected().map((p) => p.userId));
    const proximos = [...orden.slice(i + 1), ...orden.slice(0, i + 1)].filter((id) => enJuego.has(id));
    this.darTurno(proximos[0] ?? null);
    this.host.broadcast();
  }

  async action(userId: string, type: string, payload: unknown): Promise<Result> {
    if (type !== 'flip') return fail('Acción inválida.');
    if (this.host.getPhase() !== 'playing') return fail('La ronda no está en juego.');
    if (this.turno !== userId) return fail('No es tu turno.');
    if (this.mostrando) return fail('Esperá a que se tapen las cartas.');
    const carta = (payload as { carta?: unknown })?.carta;
    if (!Number.isInteger(carta) || (carta as number) < 0 || (carta as number) >= this.mazo.length) return fail('Carta inválida.');
    const i = carta as number;
    if (this.encontrados.has(this.mazo[i].par)) return fail('Esa carta ya está descubierta.');
    if (this.abiertas.includes(i)) return fail('Esa carta ya está dada vuelta.');

    this.abiertas.push(i);
    if (this.abiertas.length === 1) {
      this.host.broadcast();
      return { ok: true };
    }

    const [a, b] = this.abiertas;
    if (this.mazo[a].par === this.mazo[b].par) {
      // ¡Par! Se lo lleva y sigue jugando (con el reloj del turno de nuevo)
      this.encontrados.set(this.mazo[a].par, userId);
      this.host.addScore(userId, PUNTOS_PAR);
      if (this.everyoneDone()) {
        this.abiertas = [];
        await this.endRound();
        return { ok: true };
      }
      this.darTurno(userId);
      this.host.broadcast();
      return { ok: true };
    }
    // No es par: se ven un momento y pasa el turno
    this.mostrando = true;
    this.turnoHasta = null;
    this.host.broadcast();
    this.host.schedule(MOSTRAR_MS, () => this.siguiente());
    return { ok: true };
  }

  // Si se va (o se desconecta) el que tenía el turno, pasa al siguiente
  onPlayerGone(userId: string): Promise<void> | void {
    if (this.host.getPhase() === 'playing' && this.turno === userId && !this.mostrando) return this.siguiente();
  }

  // Si no le tocaba a nadie (estaban todos desconectados), le toca al que volvió
  onPlayerBack(userId: string) {
    if (this.host.getPhase() === 'playing' && this.turno === null) this.darTurno(userId);
  }

  protected closeRound() {
    this.turno = null;
    this.turnoHasta = null;
    this.revelada = { numero: this.roundNumber, paresPor: this.paresPor() };
  }

  private paresPor() {
    const out: Record<string, number> = {};
    for (const uid of this.encontrados.values()) out[uid] = (out[uid] ?? 0) + 1;
    return out;
  }

  view(_userId: string) {
    const visible = this.phaseShowsRound() && this.mazo.length > 0;
    const vista = (indice: number) => ({ indice, texto: this.mazo[indice].texto, icono: this.mazo[indice].icono });
    return {
      view: {
        kind: 'memotest' as const,
        numero: this.roundNumber,
        total: this.total,
        tema: TEMAS_MEMOTEST[this.host.settings.tematica as TemaMemotest]?.nombre ?? '',
        nivel: this.nivel,
        cartas: visible ? this.mazo.length : 0,
        pares: this.pares,
        // Sólo lo que está boca arriba: pares encontrados (con quién) y las del turno
        descubiertas: visible
          ? this.mazo.flatMap((c, indice) => (this.encontrados.has(c.par) ? [{ ...vista(indice), userId: this.encontrados.get(c.par)! }] : []))
          : [],
        abiertas: visible ? this.abiertas.map(vista) : [],
        mostrando: this.mostrando,
        turno: this.turno,
        turnoHasta: this.turnoHasta,
        segundosTurno: this.host.settings.seconds,
        paresPor: this.paresPor(),
        revelada: this.revelada,
      },
    };
  }
}

export const memotest: ModeDefinition = {
  game: 'memotest',
  maxPlayers: MEMOTEST_MAX_JUGADORES,
  defaults: DEFAULTS,
  validSettings,
  publicSettings: () => ({ ...DEFAULTS, tematica: pick(Object.keys(TEMAS_MEMOTEST)), dificultad: 'medio' }),
  queueSizes: ['pocos'],
  create: (host) => new MemotestMode(host),
};
