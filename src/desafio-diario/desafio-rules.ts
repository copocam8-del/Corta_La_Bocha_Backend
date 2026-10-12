import { seededRandom } from '../solo-matches/solo-quick';
import { elegirPreguntas, prepararPregunta, type PreguntaEnJuego } from '../trivia/trivia-rules';

// Desafío del día: la misma serie para todos, una vez por día (cambia a medianoche de Argentina).
// Se arma con una semilla que depende sólo de la fecha: 1 fácil, 2 medias y 2 difíciles, con las
// opciones mezcladas igual para todos.

export const PREGUNTAS_DEL_DIA = 5;
export const ACIERTOS_PARA_GANAR = 3;

export function preguntasDelDia(dia: string): PreguntaEnJuego[] {
  const azar = seededRandom(`desafio-${dia}`);
  const elegidas = [
    ...elegirPreguntas(azar, { dificultad: 'facil' }, 1),
    ...elegirPreguntas(azar, { dificultad: 'medio' }, 2),
    ...elegirPreguntas(azar, { dificultad: 'dificil' }, 2),
  ];
  return elegidas.map((p) => prepararPregunta(p, azar));
}

// V = bien, X = mal, T = se acabó el tiempo
export type Marca = 'V' | 'X' | 'T';
const EMOJI: Record<Marca, string> = { V: '🟩', X: '🟥', T: '⬛' };

// Texto para compartir: resultado sin decir cuáles eran las respuestas (sin spoilers)
export function textoCompartir(dia: string, resultado: string, aciertos: number, racha: number): string {
  const [a, m, d] = dia.split('-');
  const cuadros = [...resultado].map((c) => EMOJI[c as Marca] ?? '⬛').join('');
  return [
    `Corta La Bocha ⚽ Desafío del día ${d}/${m}/${a}`,
    `${cuadros} ${aciertos}/${resultado.length}`,
    racha > 1 ? `🔥 Racha: ${racha} días` : '🔥 Racha: 1 día',
  ].join('\n');
}

// Milisegundos hasta la próxima medianoche de Argentina (UTC−3)
export function msHastaMedianoche(now = Date.now()): number {
  const AR = 3 * 60 * 60 * 1000;
  const ar = new Date(now - AR);
  const proxima = Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() + 1) + AR;
  return proxima - now;
}

// Día anterior como "AAAA-MM-DD"
export function diaAnterior(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}
