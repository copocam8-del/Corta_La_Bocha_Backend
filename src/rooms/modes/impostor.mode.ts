import {
  ADIVINANZA_MAX, contieneLaPalabra, elegirImpostor, elegirPalabras, esLaPalabra, limpiarTexto, masVotado, mezclar, nombreCategoria,
  PISTA_MAX, PUNTOS, TEMATICAS_IMPOSTOR, type PalabraElegida, type TematicaImpostor,
} from '../../impostor/impostor-rules';
import { contieneOfensivo, MENSAJE_ADIVINANZA, MENSAJE_PISTA } from '../../moderacion/filtro';
import { RoundMode } from './round-mode';
import { fail, type GameExtra, type ModeDefinition, type ModeDeps, type ModeHost, type Result, type Settings } from './types';

// El Impostor: en cada ronda el servidor elige una palabra secreta (jugador, equipo, selección,
// estadio o DT) y un impostor. Todos ven la palabra MENOS el impostor, que sólo ve la categoría.
// Por turnos (orden al azar, dos vueltas) cada uno da una pista corta; después todos votan a quién
// creen que es el impostor. Si el más votado (uno solo: empate = zafa) es el impostor, tiene 20 s
// para adivinar la palabra: si acierta, gana igual.
//
// Seguridad: la palabra NUNCA viaja al impostor y nadie sabe quién es el impostor hasta que se
// cierra la votación (view se arma por jugador). Los votos tampoco se ven hasta el final de la ronda.

export const IMPOSTOR_RONDAS = [1, 3, 5];
export const IMPOSTOR_SEGUNDOS = [20, 30, 45]; // por turno de pista
export const IMPOSTOR_MIN_JUGADORES = 3;
export const VUELTAS = 2;
export const VOTACION_MS = 30_000;
export const ADIVINANZA_MS = 20_000;
const MARGEN_MS = 500; // demora de la red después de que el reloj llega a 0

const DEFAULTS: Settings = { tematica: 'mezcla', rounds: 3, seconds: 30 };

function validSettings(s: Partial<Settings>): Settings | null {
  const tematica = (s.tematica ?? DEFAULTS.tematica) as TematicaImpostor;
  const rounds = Number(s.rounds ?? DEFAULTS.rounds);
  const seconds = Number(s.seconds ?? DEFAULTS.seconds);
  if (!TEMATICAS_IMPOSTOR.includes(tematica) || !IMPOSTOR_RONDAS.includes(rounds) || !IMPOSTOR_SEGUNDOS.includes(seconds)) return null;
  return { tematica, rounds, seconds };
}

type Etapa = 'pistas' | 'votacion' | 'adivinanza';
type Motivo = 'zafo' | 'adivino' | 'descubierto' | 'abandono';

interface Pista {
  userId: string;
  vuelta: number;
  texto: string | null; // null = se le acabó el tiempo (o no estaba conectado)
}

interface Revelada {
  numero: number;
  palabra: string;
  categoria: string;
  impostor: string;
  votos: { de: string; a: string }[];
  acusado: string | null; // el más votado (null = empate o nadie votó)
  adivinanza: string | null;
  acerto: boolean | null; // null = no tuvo que adivinar
  ganador: 'grupo' | 'impostor';
  motivo: Motivo;
  puntos: Record<string, number>;
}

class ImpostorMode extends RoundMode {
  private palabras: PalabraElegida[] = []; // una por ronda, elegidas al arrancar
  private palabra: PalabraElegida | null = null;
  private impostor: string | null = null;
  private vecesImpostor = new Map<string, number>();
  private orden: string[] = []; // participantes de la ronda, en el orden (al azar) de los turnos
  private turnos: string[] = []; // orden × VUELTAS
  private pos = 0; // turno actual dentro de "turnos"
  private etapa: Etapa | null = null;
  private turno: string | null = null;
  private turnoHasta: number | null = null;
  private pistas: Pista[] = [];
  private votos = new Map<string, string>(); // quién → a quién
  private hasta: number | null = null; // fin de la votación o de la adivinanza
  private adivinanza: string | null = null;
  private resultado: { ganador: 'grupo' | 'impostor'; motivo: Motivo; acusado: string | null; acerto: boolean | null } | null = null;
  private revelada: Revelada | null = null;
  // Para los logros
  private aciertosVoto = new Map<string, number>();
  private invisibles = new Set<string>();

  constructor(host: ModeHost, private readonly deps: ModeDeps) {
    super(host);
  }

  // Sin reloj de ronda: hay reloj por turno, para votar y para adivinar
  protected roundMs() {
    return null;
  }

  protected resultsMs() {
    return 10_000;
  }

  protected everyoneDone() {
    return false; // la ronda la cierra el modo (votación / adivinanza), nunca "terminaron todos"
  }

  // Al arrancar: lee lo que vio ALGUNO de los jugadores (una consulta), elige las palabras de todas
  // las rondas (primero las que no vio nadie, sin repetir en la partida) y las guarda (una consulta)
  async start() {
    const jugadores = this.host.players().map((p) => p.userId);
    const vistos = await this.deps.vistos?.leer(jugadores, 'impostor');
    this.palabras = elegirPalabras(this.host.settings.tematica as TematicaImpostor, this.total, vistos);
    void this.deps.vistos?.marcar(jugadores, 'impostor', this.palabras.map((w) => w.texto));
    return super.start();
  }

  protected prepareRound() {
    this.palabra = this.palabras[(this.roundNumber - 1) % this.palabras.length];
    const candidatos = this.connected().map((p) => p.userId);
    this.impostor = candidatos.length ? elegirImpostor(candidatos, this.vecesImpostor) : null;
    if (this.impostor) this.vecesImpostor.set(this.impostor, (this.vecesImpostor.get(this.impostor) ?? 0) + 1);
    this.etapa = null;
    this.orden = [];
    this.turnos = [];
    this.pos = 0;
    this.turno = null;
    this.turnoHasta = null;
    this.pistas = [];
    this.votos = new Map();
    this.hasta = null;
    this.adivinanza = null;
    this.resultado = null;
    this.revelada = null;
  }

  protected onPlaying() {
    // Juegan la ronda los que siguen en la partida; el impostor siempre (lo elegimos entre los conectados)
    this.orden = mezclar(this.host.players().map((p) => p.userId));
    this.turnos = Array.from({ length: VUELTAS }, () => this.orden).flat();
    this.etapa = 'pistas';
    this.pos = 0;
    this.darTurno();
  }

  private sigue(userId: string) {
    return !!this.host.players().find((p) => p.userId === userId);
  }

  private conectado(userId: string) {
    return !!this.host.players().find((p) => p.userId === userId && p.connected);
  }

  // Le da el turno al que corresponde en "pos". Los que se fueron no tienen turno; los
  // desconectados pasan sin pista. Si no queda nadie, arranca la votación.
  private darTurno() {
    while (this.pos < this.turnos.length) {
      const uid = this.turnos[this.pos];
      if (!this.sigue(uid)) {
        this.pos++;
        continue;
      }
      if (!this.conectado(uid)) {
        this.pistas.push({ userId: uid, vuelta: this.vueltaDe(this.pos), texto: null });
        this.pos++;
        continue;
      }
      const ms = this.host.settings.seconds * 1000;
      this.turno = uid;
      this.turnoHasta = Date.now() + ms;
      const pos = this.pos;
      this.host.schedule(ms + MARGEN_MS, () => this.turnoVencido(pos));
      return;
    }
    this.empezarVotacion();
  }

  private vueltaDe(pos: number) {
    return Math.floor(pos / Math.max(1, this.orden.length)) + 1;
  }

  // Se le acabó el tiempo: pasa sin pista
  private turnoVencido(pos: number) {
    if (this.host.getPhase() !== 'playing' || this.etapa !== 'pistas' || this.pos !== pos || !this.turno) return;
    this.registrarPista(this.turno, null);
    this.host.broadcast();
  }

  private registrarPista(userId: string, texto: string | null) {
    this.pistas.push({ userId, vuelta: this.vueltaDe(this.pos), texto });
    this.pos++;
    this.turno = null;
    this.turnoHasta = null;
    this.darTurno();
  }

  private empezarVotacion() {
    this.etapa = 'votacion';
    this.turno = null;
    this.turnoHasta = null;
    this.hasta = Date.now() + VOTACION_MS;
    this.host.schedule(VOTACION_MS + MARGEN_MS, () => this.cerrarVotacion());
  }

  // Votan los participantes que siguen en la partida; se cierra antes si ya votaron todos los conectados
  private votaronTodos() {
    return this.orden.filter((u) => this.conectado(u)).every((u) => this.votos.has(u));
  }

  private async cerrarVotacion() {
    if (this.host.getPhase() !== 'playing' || this.etapa !== 'votacion' || !this.impostor) return;
    this.host.cancelTimer();
    // Sólo cuentan los votos de (y a) quienes siguen en la partida
    for (const [de, a] of [...this.votos]) if (!this.sigue(de) || !this.sigue(a)) this.votos.delete(de);
    const acusado = masVotado(this.votos);
    if (acusado !== this.impostor) {
      await this.cerrar({ ganador: 'impostor', motivo: 'zafo', acusado, acerto: null });
      return;
    }
    // ¡Lo descubrieron! Se revela quién es y tiene ADIVINANZA_MS para adivinar la palabra
    this.etapa = 'adivinanza';
    this.resultado = { ganador: 'grupo', motivo: 'descubierto', acusado, acerto: null };
    this.hasta = Date.now() + ADIVINANZA_MS;
    this.host.broadcast();
    this.host.schedule(ADIVINANZA_MS + MARGEN_MS, () => this.cerrar({ ganador: 'grupo', motivo: 'descubierto', acusado, acerto: false }));
  }

  private async cerrar(r: NonNullable<ImpostorMode['resultado']>) {
    if (this.host.getPhase() !== 'playing') return;
    this.resultado = r;
    await this.endRound();
  }

  async action(userId: string, type: string, payload: unknown): Promise<Result> {
    if (this.host.getPhase() !== 'playing' || !this.palabra || !this.etapa) return fail('La ronda no está en juego.');
    if (!this.orden.includes(userId)) return fail('Esta ronda no la jugás: esperá a la próxima.');
    const datos = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;

    if (type === 'pista') {
      if (this.etapa !== 'pistas') return fail('Ya no es momento de dar pistas.');
      if (this.turno !== userId) return fail('No es tu turno.');
      const texto = limpiarTexto(datos.pista);
      if (!texto) return fail('Escribí tu pista.');
      if (texto.length > PISTA_MAX) return fail(`La pista puede tener hasta ${PISTA_MAX} caracteres.`);
      // A todos (también al impostor): ninguna palabra del banco es ofensiva, así que no le da pistas
      if (contieneOfensivo(texto)) return fail(MENSAJE_PISTA);
      // La regla es para los que SABEN la palabra. Al impostor no se le revisa: si se lo
      // rechazáramos, sabría que adivinó. Y como a los demás no se les acepta, una pista con la
      // palabra sólo puede ser del impostor (se delata solo).
      if (userId !== this.impostor && contieneLaPalabra(texto, this.palabra)) return fail('Tu pista no puede tener la palabra secreta.');
      this.registrarPista(userId, texto);
      this.host.broadcast();
      return { ok: true };
    }

    if (type === 'voto') {
      if (this.etapa !== 'votacion') return fail('Ahora no se vota.');
      if (this.votos.has(userId)) return fail('Ya votaste.');
      const a = datos.userId;
      if (typeof a !== 'string' || !this.orden.includes(a) || !this.sigue(a)) return fail('Voto inválido.');
      if (a === userId) return fail('No te podés votar a vos.');
      this.votos.set(userId, a);
      if (this.votaronTodos()) await this.cerrarVotacion();
      else this.host.broadcast();
      return { ok: true };
    }

    if (type === 'adivinar') {
      if (this.etapa !== 'adivinanza') return fail('Ahora no se adivina.');
      if (userId !== this.impostor) return fail('Sólo el impostor puede adivinar.');
      const intento = limpiarTexto(datos.respuesta);
      if (!intento) return fail('Escribí la palabra que querés arriesgar.');
      if (intento.length > ADIVINANZA_MAX) return fail(`Hasta ${ADIVINANZA_MAX} caracteres.`);
      // No gasta el intento: puede volver a escribir
      if (contieneOfensivo(intento)) return fail(MENSAJE_ADIVINANZA);
      this.adivinanza = intento;
      const acerto = esLaPalabra(intento, this.palabra);
      await this.cerrar({ ganador: acerto ? 'impostor' : 'grupo', motivo: acerto ? 'adivino' : 'descubierto', acusado: this.impostor, acerto });
      return { ok: true };
    }

    return fail('Acción inválida.');
  }

  async onPlayerGone(userId: string, why?: 'left' | 'disconnected') {
    if (this.host.getPhase() !== 'playing' || !this.etapa) return;
    // Si el impostor abandona, ganan los demás
    if (why === 'left' && userId === this.impostor) {
      await this.cerrar({ ganador: 'grupo', motivo: 'abandono', acusado: this.resultado?.acusado ?? null, acerto: null });
      return;
    }
    if (this.etapa === 'pistas' && this.turno === userId) {
      this.registrarPista(userId, null);
      this.host.broadcast();
    } else if (this.etapa === 'votacion' && this.votaronTodos()) {
      await this.cerrarVotacion();
    }
  }

  protected closeRound() {
    const palabra = this.palabra;
    const impostor = this.impostor;
    const r = this.resultado;
    this.etapa = null;
    this.turno = null;
    this.turnoHasta = null;
    this.hasta = null;
    if (!palabra || !impostor || !r) return;
    const puntos: Record<string, number> = {};
    const sumar = (uid: string, n: number) => {
      puntos[uid] = (puntos[uid] ?? 0) + n;
      this.host.addScore(uid, n);
    };
    const enJuego = this.orden.filter((u) => this.sigue(u));
    if (r.ganador === 'grupo') {
      for (const u of enJuego) {
        if (u === impostor) continue;
        sumar(u, PUNTOS.grupo + (this.votos.get(u) === impostor ? PUNTOS.votoCorrecto : 0));
      }
    } else {
      sumar(impostor, r.motivo === 'adivino' ? PUNTOS.impostorAdivino : PUNTOS.impostorInvisible);
    }
    for (const [de, a] of this.votos) if (a === impostor) this.aciertosVoto.set(de, (this.aciertosVoto.get(de) ?? 0) + 1);
    const votosRecibidos = [...this.votos.values()].filter((a) => a === impostor).length;
    if (r.ganador === 'impostor' && votosRecibidos === 0) this.invisibles.add(impostor);

    this.revelada = {
      numero: this.roundNumber,
      palabra: palabra.texto,
      categoria: nombreCategoria(palabra.categoria),
      impostor,
      votos: [...this.votos].map(([de, a]) => ({ de, a })),
      acusado: r.acusado,
      adivinanza: this.adivinanza,
      acerto: r.acerto,
      ganador: r.ganador,
      motivo: r.motivo,
      puntos,
    };
  }

  // Para los logros: "invisible" = ganó una ronda de impostor sin recibir ningún voto;
  // aciertosVoto = cuántas veces votó al impostor en la partida
  extraFor(userId: string): GameExtra | undefined {
    return { invisible: this.invisibles.has(userId), aciertosVoto: this.aciertosVoto.get(userId) ?? 0 };
  }

  view(userId: string) {
    const palabra = this.palabra;
    const enRonda = !!palabra && this.host.getPhase() === 'playing';
    const soyImpostor = enRonda && this.impostor === userId;
    return {
      view: {
        kind: 'impostor' as const,
        numero: this.roundNumber,
        total: this.total,
        tematica: this.host.settings.tematica,
        segundosTurno: this.host.settings.seconds,
        maxPista: PISTA_MAX,
        etapa: enRonda ? this.etapa : null,
        // Lo propio de cada uno: el impostor nunca recibe la palabra
        categoria: enRonda ? nombreCategoria(palabra.categoria) : null,
        rol: enRonda ? (soyImpostor ? ('impostor' as const) : ('grupo' as const)) : null,
        palabra: enRonda && !soyImpostor ? palabra.texto : null,
        // Lo público
        orden: enRonda ? this.orden : [],
        turno: enRonda ? this.turno : null,
        turnoHasta: enRonda ? this.turnoHasta : null,
        vuelta: enRonda && this.etapa === 'pistas' ? this.vueltaDe(this.pos) : null,
        vueltas: VUELTAS,
        pistas: enRonda || this.revelada ? this.pistas : [],
        hasta: enRonda ? this.hasta : null,
        // Votación: quiénes ya votaron (no a quién) y mi voto
        votaron: enRonda && this.etapa === 'votacion' ? [...this.votos.keys()] : [],
        miVoto: enRonda ? (this.votos.get(userId) ?? null) : null,
        // Recién cuando se cierra la votación y lo descubrieron: quién es (tiene que adivinar)
        descubierto: enRonda && this.etapa === 'adivinanza' ? this.impostor : null,
        revelada: this.revelada,
      },
    };
  }
}

export const impostor: ModeDefinition = {
  game: 'impostor',
  minPlayers: IMPOSTOR_MIN_JUGADORES,
  maxPlayers: 8,
  defaults: DEFAULTS,
  validSettings,
  publicSettings: () => ({ ...DEFAULTS }),
  queueSizes: ['pocos', 'muchos'],
  create: (host, deps) => new ImpostorMode(host, deps),
};
