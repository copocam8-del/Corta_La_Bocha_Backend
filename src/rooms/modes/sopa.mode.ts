import {
  buscarPalabra, celdasDe, celdasDeLinea, CONFIG_SOPA, generarSopa, TEMATICAS_SOPA,
  type DificultadSopa, type Sopa, type TematicaSopa,
} from '../../sopa/sopa-rules';
import { RoundMode } from './round-mode';
import { fail, pick, type ModeDefinition, type ModeDeps, type ModeHost, type Result, type Settings } from './types';

// Sopa de letras multijugador: misma grilla para todos. Cada palabra cuenta para el PRIMERO que la
// encuentra (el servidor decide quién llegó primero). Dónde está cada palabra queda en el servidor
// hasta que alguien la encuentra (o termina la ronda).

export const SOPA_GRILLAS = [1, 2, 3];
export const SOPA_SEGUNDOS = [120, 180, 240, 300];
export const SOPA_DIFICULTADES: DificultadSopa[] = ['facil', 'medio', 'dificil'];

const DEFAULTS: Settings = { tematica: 'jugadores', dificultad: 'facil', rounds: 1, seconds: 180 };

function validSettings(s: Partial<Settings>): Settings | null {
  const tematica = s.tematica ?? DEFAULTS.tematica;
  const dificultad = (s.dificultad ?? DEFAULTS.dificultad) as DificultadSopa;
  const rounds = Number(s.rounds ?? DEFAULTS.rounds);
  const seconds = Number(s.seconds ?? DEFAULTS.seconds);
  if (!(tematica in TEMATICAS_SOPA) || !SOPA_DIFICULTADES.includes(dificultad)) return null;
  if (!SOPA_GRILLAS.includes(rounds) || !SOPA_SEGUNDOS.includes(seconds)) return null;
  return { tematica, dificultad, rounds, seconds };
}

// Puntos por palabra: 5 + largo, por el multiplicador de la dificultad (igual que jugando solo)
export const puntosPalabra = (palabra: string, dificultad: DificultadSopa) => Math.round((5 + palabra.length) * CONFIG_SOPA[dificultad].multiplicador);

interface Celda {
  f: number;
  c: number;
}

class SopaMode extends RoundMode {
  private sopas: Sopa[] = []; // una por ronda, armadas al arrancar
  private sopa: Sopa | null = null;

  constructor(host: ModeHost, private readonly deps: ModeDeps) {
    super(host);
  }

  // Al arrancar: lee lo que vio ALGUNO de los jugadores (una consulta), arma las grillas de todas las
  // rondas (primero palabras que no vio nadie, sin repetir entre grillas) y las guarda (una consulta)
  async start() {
    const jugadores = this.host.players().map((p) => p.userId);
    const vistos = new Map(await this.deps.vistos?.leer(jugadores, 'sopa_de_letras'));
    const ahora = Date.now();
    this.sopas = [];
    for (let r = 0; r < this.total; r++) {
      const sopa = generarSopa(this.host.settings.tematica as TematicaSopa, this.dificultad, Math.random, vistos);
      this.sopas.push(sopa);
      for (const u of sopa.ubicaciones) vistos.set(u.palabra, ahora + r);
    }
    void this.deps.vistos?.marcar(jugadores, 'sopa_de_letras', this.sopas.flatMap((x) => x.ubicaciones.map((u) => u.palabra)));
    return super.start();
  }
  private encontradas = new Map<string, string>(); // palabra → userId
  private revelada: null | { numero: number; todas: { palabra: string; celdas: Celda[]; userId: string | null }[] } = null;

  private get dificultad() {
    return this.host.settings.dificultad as DificultadSopa;
  }

  protected prepareRound() {
    this.sopa = this.sopas[this.roundNumber - 1];
    this.encontradas = new Map();
    this.revelada = null;
  }

  // La ronda termina cuando se encontraron todas (no depende de los jugadores)
  protected everyoneDone() {
    return !!this.sopa && this.encontradas.size === this.sopa.ubicaciones.length;
  }

  async action(userId: string, type: string, payload: unknown): Promise<Result> {
    if (type !== 'mark') return fail('Acción inválida.');
    if (this.host.getPhase() !== 'playing' || !this.sopa) return fail('La ronda no está en juego.');
    const { desde, hasta } = (payload ?? {}) as { desde?: Celda; hasta?: Celda };
    const tamano = this.sopa.grilla.length;
    for (const p of [desde, hasta]) {
      if (!p || !Number.isInteger(p.f) || !Number.isInteger(p.c) || p.f < 0 || p.c < 0 || p.f >= tamano || p.c >= tamano) {
        return fail('Celda fuera de la grilla.');
      }
    }
    if (!celdasDeLinea(desde!, hasta!)) return fail('Marcá en línea recta.');
    const u = buscarPalabra(this.sopa, desde!, hasta!);
    if (!u) return fail('Ahí no hay ninguna palabra.');
    const duenio = this.encontradas.get(u.palabra);
    if (duenio) return fail(duenio === userId ? 'Esa ya la encontraste.' : `Esa ya la encontró ${this.host.player(duenio)?.username ?? 'otro'}.`);
    this.encontradas.set(u.palabra, userId);
    this.host.addScore(userId, puntosPalabra(u.palabra, this.dificultad)); // se suma en el momento
    await this.checkDone();
    return { ok: true };
  }

  protected closeRound() {
    if (!this.sopa) return;
    this.revelada = {
      numero: this.roundNumber,
      todas: this.sopa.ubicaciones.map((u) => ({ palabra: u.palabra, celdas: celdasDe(u), userId: this.encontradas.get(u.palabra) ?? null })),
    };
  }

  view(_userId: string) {
    const sopa = this.sopa;
    const visible = !!sopa && this.phaseShowsRound();
    const porJugador: Record<string, number> = {};
    for (const uid of this.encontradas.values()) porJugador[uid] = (porJugador[uid] ?? 0) + 1;
    return {
      view: {
        kind: 'sopa' as const,
        numero: this.roundNumber,
        total: this.total,
        tematica: TEMATICAS_SOPA[this.host.settings.tematica as TematicaSopa]?.nombre ?? '',
        dificultad: this.dificultad,
        endsAt: this.endsAt,
        segundos: this.host.settings.seconds,
        grilla: visible ? sopa.grilla : null,
        palabras: visible ? sopa.ubicaciones.map((u) => u.palabra).sort() : [],
        // Sólo dónde están las que YA se encontraron (y quién)
        encontradas: visible
          ? sopa.ubicaciones
              .filter((u) => this.encontradas.has(u.palabra))
              .map((u) => {
                const uid = this.encontradas.get(u.palabra)!;
                return { palabra: u.palabra, celdas: celdasDe(u), userId: uid, username: this.host.player(uid)?.username ?? '' };
              })
          : [],
        porJugador,
        revelada: this.revelada,
      },
    };
  }
}

export const sopa: ModeDefinition = {
  game: 'sopa_de_letras',
  maxPlayers: 8,
  defaults: DEFAULTS,
  validSettings,
  // En la pública la temática se sortea
  publicSettings: () => ({ ...DEFAULTS, tematica: pick(Object.keys(TEMATICAS_SOPA)), dificultad: 'medio', seconds: 240 }),
  queueSizes: ['pocos', 'muchos'],
  create: (host, deps) => new SopaMode(host, deps),
};
