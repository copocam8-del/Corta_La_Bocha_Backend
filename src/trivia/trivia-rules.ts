import { PREGUNTAS, type DificultadTrivia, type Pregunta } from './trivia-bank';
import { priorizarNoVistos, type Vistos } from '../games/vistos';

// Reglas de la trivia (las usa también el desafío diario). Todo se decide en el servidor.

export const PREGUNTAS_POR_PARTIDA = 10;
export const SEGUNDOS_POR_PREGUNTA = 20;
// Margen para la demora de la red: una respuesta que llega hasta 2 s tarde todavía vale
export const GRACIA_MS = 2000;
// Aprobás (cuenta como partida ganada) con 6 o más aciertos
export const ACIERTOS_PARA_GANAR = 6;

export const PUNTOS_BASE: Record<DificultadTrivia, number> = { facil: 10, medio: 15, dificil: 20 };
export const BONUS_RAPIDEZ_MAX = 10;

// Puntos de una respuesta: base por dificultad + bonus por rapidez (proporcional al tiempo que sobró)
export function puntosRespuesta(dificultad: DificultadTrivia, correcta: boolean, ms: number, limiteMs = SEGUNDOS_POR_PREGUNTA * 1000): number {
  if (!correcta || ms > limiteMs + GRACIA_MS) return 0;
  const sobrante = Math.max(0, limiteMs - ms) / limiteMs;
  return PUNTOS_BASE[dificultad] + Math.round(BONUS_RAPIDEZ_MAX * sobrante);
}

// Mezcla con un generador (Fisher-Yates). Con un generador con semilla da siempre lo mismo.
export function mezclar<T>(lista: T[], azar: () => number): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Pregunta lista para jugar: las 4 opciones mezcladas y el índice de la correcta (que queda en el servidor)
export interface PreguntaEnJuego {
  id: string;
  opciones: string[];
  correcta: number;
}

export function prepararPregunta(p: Pregunta, azar: () => number): PreguntaEnJuego {
  const opciones = mezclar([p.correcta, ...p.incorrectas], azar);
  return { id: p.id, opciones, correcta: opciones.indexOf(p.correcta) };
}

// Con "vistos" (lo que ya vio el usuario o los jugadores de la sala), primero las que no vio; si no
// alcanzan, las que vio hace más tiempo. Sin "vistos" (ej. el desafío del día) elige igual que siempre.
export function elegirPreguntas(
  azar: () => number,
  filtro: { categoria?: string; dificultad?: DificultadTrivia },
  cantidad = PREGUNTAS_POR_PARTIDA,
  vistos?: Vistos,
): Pregunta[] {
  const candidatas = PREGUNTAS.filter(
    (p) => (!filtro.categoria || p.categoria === filtro.categoria) && (!filtro.dificultad || p.dificultad === filtro.dificultad),
  );
  return priorizarNoVistos(mezclar(candidatas, azar), (p) => p.id, vistos).slice(0, cantidad);
}

export const preguntaPorId = (id: string) => PREGUNTAS.find((p) => p.id === id)!;
