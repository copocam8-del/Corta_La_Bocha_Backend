import { BANCO_IMPOSTOR, NOMBRES_CATEGORIA, type CategoriaImpostor, type PalabraImpostor } from './impostor-bank';

// Reglas de "El Impostor" que no dependen de la sala (se prueban solas en impostor.spec.ts).

export type TematicaImpostor = CategoriaImpostor | 'mezcla';
export const TEMATICAS_IMPOSTOR: TematicaImpostor[] = ['jugadores', 'equipos', 'selecciones', 'estadios', 'dt', 'mezcla'];
export const CATEGORIAS_IMPOSTOR = Object.keys(BANCO_IMPOSTOR) as CategoriaImpostor[];

export const PISTA_MAX = 30; // caracteres por pista
export const ADIVINANZA_MAX = 60;

export interface PalabraElegida extends PalabraImpostor {
  categoria: CategoriaImpostor;
}

// Todas las palabras de una temática (con su categoría: en "mezcla" cada una dice de dónde viene)
export function palabrasDe(tematica: TematicaImpostor): PalabraElegida[] {
  const cats = tematica === 'mezcla' ? CATEGORIAS_IMPOSTOR : [tematica];
  return cats.flatMap((categoria) => BANCO_IMPOSTOR[categoria].map((w) => ({ ...w, categoria })));
}

export const nombreCategoria = (c: CategoriaImpostor) => NOMBRES_CATEGORIA[c];

// Sin tildes, sin mayúsculas y sólo letras y números ("Di María" → "dimaria", "Colo-Colo" → "colocolo"…)
export function compactar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Palabras sueltas de un texto (sin tildes ni mayúsculas)
const palabrasSueltas = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

// Lo que no puede aparecer en una pista: el nombre entero (y cada alias) y cada palabra de 4 letras
// o más ("Boca Juniors" → "boca", "juniors"). Las cortas ("de", "la", "del") no cuentan.
function prohibidas(w: PalabraImpostor): string[] {
  const formas = [w.texto, ...(w.alias ?? [])];
  const out = new Set<string>();
  for (const f of formas) {
    const entera = compactar(f);
    if (entera.length >= 2) out.add(entera);
    for (const pal of palabrasSueltas(f)) if (pal.length >= 4) out.add(pal);
  }
  return [...out];
}

// ¿La pista contiene la palabra secreta? Se compara sin tildes, mayúsculas, espacios ni signos,
// así "M e s s i" o "MESSÍ" también cuentan.
export function contieneLaPalabra(pista: string, w: PalabraImpostor): boolean {
  const p = compactar(pista);
  return prohibidas(w).some((x) => p.includes(x));
}

// ¿La adivinanza del impostor es la palabra? Tiene que ser el nombre o uno de sus alias (sin tildes ni mayúsculas)
export function esLaPalabra(intento: string, w: PalabraImpostor): boolean {
  const i = compactar(intento);
  return i.length > 0 && [w.texto, ...(w.alias ?? [])].some((f) => compactar(f) === i);
}

// Limpia lo que escribió el jugador: texto, sin espacios de más. null si no es texto.
export function limpiarTexto(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return v.replace(/\s+/g, ' ').trim();
}

// Puntos de una ronda
export const PUNTOS = {
  grupo: 10, // cada uno de los demás si descubren al impostor (y no adivina)
  votoCorrecto: 5, // extra para quien votó al impostor
  impostorInvisible: 30, // el impostor gana sin que lo descubran
  impostorAdivino: 20, // lo descubrieron pero adivinó la palabra
};

// Elige al impostor: entre los que menos veces lo fueron en la partida, uno al azar. Así no le
// toca siempre al mismo y, en una partida larga, le toca a todos.
export function elegirImpostor(candidatos: string[], veces: Map<string, number>, azar: () => number = Math.random): string {
  const min = Math.min(...candidatos.map((u) => veces.get(u) ?? 0));
  const menos = candidatos.filter((u) => (veces.get(u) ?? 0) === min);
  return menos[Math.floor(azar() * menos.length)];
}

// Fisher-Yates: orden al azar para los turnos de pistas
export function mezclar<T>(lista: T[], azar: () => number = Math.random): T[] {
  const out = [...lista];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Votación: el más votado (sólo si es UNO). Empate o nadie votó → null (el impostor zafa).
export function masVotado(votos: Map<string, string>): string | null {
  const conteo = new Map<string, number>();
  for (const a of votos.values()) conteo.set(a, (conteo.get(a) ?? 0) + 1);
  let mejor: string | null = null;
  let max = 0;
  let empate = false;
  for (const [u, n] of conteo) {
    if (n > max) {
      mejor = u;
      max = n;
      empate = false;
    } else if (n === max) {
      empate = true;
    }
  }
  return empate ? null : mejor;
}
