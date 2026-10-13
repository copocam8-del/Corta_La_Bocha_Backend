import { BANCO, type Dificultad, type Palabra } from '../../ahorcado/ahorcado-bank';
import { completa, esLetra, letrasDe, MAX_ERRORES, mascara, mismaRespuesta, normalizar, puntos } from '../../ahorcado/ahorcado-rules';
import { RoundMode } from './round-mode';
import { fail, type GameExtra, type ModeDefinition, type ModeDeps, type ModeHost, type Result, type Settings } from './types';
import { elegirUnaNoVista } from '../../games/vistos';

// Ahorcado multijugador: todos adivinan la MISMA palabra a la vez, cada uno con su pelota (sus
// letras y sus errores). Suma quien la completa: más con menos errores y más rápido, y un bonus
// por el orden de llegada (el primero, más). La palabra viaja recién cuando termina la ronda; de
// los rivales sólo se ve cuántos errores llevan y qué tan avanzados están (nunca sus letras).

export const AHORCADO_PALABRAS = [1, 3, 5];
export const AHORCADO_SEGUNDOS = [60, 90, 120];
export const AHORCADO_DIFICULTADES: Dificultad[] = ['facil', 'medio', 'dificil'];
export const BONUS_ORDEN = [20, 10, 5]; // primero, segundo y tercero en completarla

const DEFAULTS: Settings = { tematica: 'general', dificultad: 'medio', rounds: 3, seconds: 90 };

function validSettings(s: Partial<Settings>): Settings | null {
  const dificultad = (s.dificultad ?? DEFAULTS.dificultad) as Dificultad;
  const rounds = Number(s.rounds ?? DEFAULTS.rounds);
  const seconds = Number(s.seconds ?? DEFAULTS.seconds);
  if (!AHORCADO_DIFICULTADES.includes(dificultad) || !AHORCADO_PALABRAS.includes(rounds) || !AHORCADO_SEGUNDOS.includes(seconds)) return null;
  return { tematica: 'general', dificultad, rounds, seconds };
}

type Estado = 'jugando' | 'completo' | 'muerto';

interface Jugada {
  adivinadas: string[];
  erradas: string[];
  fallidos: number; // palabras arriesgadas que no eran (1 error cada una)
  estado: Estado;
  ms: number | null; // cuánto tardó en completarla
}

const errores = (j: Jugada) => j.erradas.length + j.fallidos;

class AhorcadoMode extends RoundMode {
  private palabras: Palabra[] = []; // una por ronda, elegidas al arrancar
  private palabra: Palabra | null = null;
  private jugadas = new Map<string, Jugada>();
  private llegada: string[] = []; // orden en que la completaron
  private revelada: null | {
    numero: number;
    respuesta: string;
    resultados: { userId: string; username: string; estado: Estado; errores: number; segundos: number | null; puntos: number }[];
  } = null;
  private erroresTotales = new Map<string, number>();

  constructor(host: ModeHost, private readonly deps: ModeDeps) {
    super(host);
  }

  private get dificultad() {
    return this.host.settings.dificultad as Dificultad;
  }

  // Al arrancar: lee lo que vio ALGUNO de los jugadores (una consulta), elige las palabras de todas
  // las rondas (primero las que no vio nadie, sin repetir en la partida) y las guarda (una consulta)
  async start() {
    const jugadores = this.host.players().map((p) => p.userId);
    const vistos = new Map(await this.deps.vistos?.leer(jugadores, 'ahorcado'));
    const ahora = Date.now();
    this.palabras = [];
    for (let r = 0; r < this.total; r++) {
      const p = elegirUnaNoVista(BANCO[this.dificultad], (x) => x.texto, Math.random, vistos);
      this.palabras.push(p);
      vistos.set(p.texto, ahora + r); // para no repetirla en otra ronda
    }
    void this.deps.vistos?.marcar(jugadores, 'ahorcado', this.palabras.map((p) => p.texto));
    return super.start();
  }

  protected prepareRound() {
    this.palabra = this.palabras[(this.roundNumber - 1) % this.palabras.length];
    this.jugadas = new Map();
    this.llegada = [];
    this.revelada = null;
  }

  private jugada(userId: string): Jugada {
    let j = this.jugadas.get(userId);
    if (!j) {
      j = { adivinadas: [], erradas: [], fallidos: 0, estado: 'jugando', ms: null };
      this.jugadas.set(userId, j);
    }
    return j;
  }

  protected everyoneDone() {
    return this.connected().every((p) => this.jugadas.get(p.userId)?.estado !== undefined && this.jugadas.get(p.userId)!.estado !== 'jugando');
  }

  async action(userId: string, type: string, payload: unknown): Promise<Result> {
    if (this.host.getPhase() !== 'playing' || !this.palabra) return fail('La ronda no está en juego.');
    const j = this.jugada(userId);
    if (j.estado !== 'jugando') return fail(j.estado === 'completo' ? 'Ya la completaste: esperá a los demás.' : 'Se te murió la redonda: esperá a los demás.');
    const respuesta = this.palabra.texto;

    if (type === 'letter') {
      const letra = normalizar(String((payload as { letra?: unknown })?.letra ?? '').trim());
      if (letra.length !== 1 || !esLetra(letra)) return fail('Mandá una sola letra (A a Z o Ñ).');
      if (j.adivinadas.includes(letra) || j.erradas.includes(letra)) return fail('Esa letra ya la probaste.');
      if (normalizar(respuesta).includes(letra)) j.adivinadas.push(letra);
      else j.erradas.push(letra);
    } else if (type === 'guess') {
      const intento = String((payload as { respuesta?: unknown })?.respuesta ?? '').slice(0, 80);
      if (!intento.trim()) return fail('Escribí la respuesta que querés arriesgar.');
      if (mismaRespuesta(intento, respuesta)) j.adivinadas = [...new Set([...j.adivinadas, ...letrasDe(respuesta)])];
      else j.fallidos += 1;
    } else {
      return fail('Acción inválida.');
    }

    if (completa(respuesta, j.adivinadas)) {
      j.estado = 'completo';
      j.ms = Date.now() - this.startedAt;
      this.llegada.push(userId);
    } else if (errores(j) >= MAX_ERRORES) {
      j.estado = 'muerto';
    }
    await this.checkDone();
    return { ok: true };
  }

  protected closeRound() {
    if (!this.palabra) return;
    const resultados = this.host.players().map((p) => {
      const j = this.jugada(p.userId);
      const segundos = j.ms === null ? null : Math.round(j.ms / 1000);
      const orden = this.llegada.indexOf(p.userId);
      const pts = j.estado === 'completo' ? puntos(this.dificultad, errores(j), segundos ?? 0, true) + (BONUS_ORDEN[orden] ?? 0) : 0;
      this.host.addScore(p.userId, pts);
      this.erroresTotales.set(p.userId, (this.erroresTotales.get(p.userId) ?? 0) + errores(j) + (j.estado === 'completo' ? 0 : 1));
      return { userId: p.userId, username: p.username, estado: j.estado, errores: errores(j), segundos, puntos: pts };
    });
    this.revelada = { numero: this.roundNumber, respuesta: this.palabra.texto, resultados };
  }

  // Para los logros: "la redonda intacta" = ganar sin ningún error (no completar una palabra cuenta como error)
  extraFor(userId: string): GameExtra | undefined {
    return { errores: this.erroresTotales.get(userId) ?? 0, dificultad: this.dificultad };
  }

  view(userId: string) {
    const palabra = this.palabra;
    const visible = !!palabra && this.phaseShowsRound();
    const mia = this.jugadas.get(userId);
    const total = palabra ? letrasDe(palabra.texto).size : 0;
    return {
      view: {
        kind: 'ahorcado' as const,
        numero: this.roundNumber,
        total: this.total,
        dificultad: this.dificultad,
        maxErrores: MAX_ERRORES,
        endsAt: this.endsAt,
        pista: visible ? palabra.pista : null,
        yo: visible
          ? {
              mascara: mascara(palabra.texto, mia?.adivinadas ?? []),
              adivinadas: mia?.adivinadas ?? [],
              erradas: mia?.erradas ?? [],
              errores: mia ? errores(mia) : 0,
              estado: mia?.estado ?? 'jugando',
            }
          : null,
        // De los rivales, sólo errores y avance (nunca las letras)
        rivales: this.host
          .players()
          .filter((p) => p.userId !== userId)
          .map((p) => {
            const j = this.jugadas.get(p.userId);
            return {
              userId: p.userId,
              username: p.username,
              errores: j ? errores(j) : 0,
              estado: j?.estado ?? 'jugando',
              avance: j && total ? Math.round((j.adivinadas.length / total) * 100) : 0,
            };
          }),
        revelada: this.revelada,
      },
    };
  }
}

export const ahorcado: ModeDefinition = {
  game: 'ahorcado',
  maxPlayers: 8,
  defaults: DEFAULTS,
  validSettings,
  publicSettings: () => ({ ...DEFAULTS }),
  queueSizes: ['pocos', 'muchos'],
  create: (host, deps) => new AhorcadoMode(host, deps),
};
