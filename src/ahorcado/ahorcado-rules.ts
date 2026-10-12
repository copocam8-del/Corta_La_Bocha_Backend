import type { Dificultad } from './ahorcado-bank';

// Reglas del ahorcado "Que no muera la redonda" (todo se decide en el servidor).
// Con cada error la pelota se desinfla un poco; con el error número MAX_ERRORES "muere la redonda".

export const MAX_ERRORES = 6;
export const LETRAS_VALIDAS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

// Puntos al ganar: base por dificultad − errores + bonus por rapidez
export const PUNTOS_BASE: Record<Dificultad, number> = { facil: 60, medio: 90, dificil: 130 };
export const PUNTOS_POR_ERROR = 10;
export const BONUS_RAPIDEZ_MAX = 30; // se pierde 1 punto cada 5 segundos
export const PUNTOS_MINIMOS_AL_GANAR = 10;

// "Pelé" → "PELE", "España" → "ESPAÑA" (la Ñ es una letra aparte), "Modrić" → "MODRIC"
export function normalizar(texto: string): string {
  return texto
    .toUpperCase()
    .replace(/Ñ/g, '\u0000')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0000/g, 'Ñ');
}

export const esLetra = (c: string) => LETRAS_VALIDAS.includes(c);

// Lo que ve el jugador: letras adivinadas a la vista, el resto "_". Espacios y signos se ven siempre.
export function mascara(respuesta: string, adivinadas: string[]): string[] {
  return [...normalizar(respuesta)].map((c) => (esLetra(c) && !adivinadas.includes(c) ? '_' : c));
}

export function letrasDe(respuesta: string): Set<string> {
  return new Set([...normalizar(respuesta)].filter(esLetra));
}

export function completa(respuesta: string, adivinadas: string[]): boolean {
  return [...letrasDe(respuesta)].every((l) => adivinadas.includes(l));
}

export function puntos(dificultad: Dificultad, errores: number, segundos: number, gano: boolean): number {
  if (!gano) return 0;
  const bonus = Math.max(0, BONUS_RAPIDEZ_MAX - Math.floor(segundos / 5));
  return Math.max(PUNTOS_MINIMOS_AL_GANAR, PUNTOS_BASE[dificultad] - PUNTOS_POR_ERROR * errores + bonus);
}

// Arriesgar la palabra entera: se compara sin tildes, mayúsculas ni signos
export function mismaRespuesta(intento: string, respuesta: string): boolean {
  const limpio = (s: string) => [...normalizar(s)].filter(esLetra).join('');
  return limpio(intento).length > 0 && limpio(intento) === limpio(respuesta);
}
