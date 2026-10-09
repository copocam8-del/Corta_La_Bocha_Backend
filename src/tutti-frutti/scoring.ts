import { compareKey } from './answer-rules';

// Puntaje clásico del Tutti Frutti, por categoría. Sirve igual para la partida contra la máquina
// (la máquina es un jugador más) y para el multijugador.
//   20 → es el ÚNICO jugador con respuesta válida en esa categoría
//   10 → es válida y nadie más puso la misma
//    5 → es válida pero otro jugador puso la misma
//    0 → no es válida, está vacía o no se pudo validar
export const POINTS_SOLE = 20;
export const POINTS_UNIQUE = 10;
export const POINTS_SHARED = 5;

export type AnswerStatus = 'valid' | 'invalid' | 'empty' | 'unverified';

export interface CategoryEntry {
  playerId: string;
  status: AnswerStatus;
  // Nombre para comparar entre jugadores: el canónico de la IA si lo hay (así "Messi" y
  // "Lionel Messi" cuentan como la misma respuesta), si no lo que escribió el jugador.
  canonical: string | null;
}

export function scoreCategory(entries: CategoryEntry[], category?: string): Record<string, number> {
  const points: Record<string, number> = {};
  const valid = entries.filter((e) => e.status === 'valid');

  const countByKey = new Map<string, number>();
  for (const e of valid) {
    const key = compareKey(e.canonical, category);
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }

  for (const e of entries) {
    if (e.status !== 'valid') points[e.playerId] = 0;
    else if (valid.length === 1) points[e.playerId] = POINTS_SOLE;
    else points[e.playerId] = (countByKey.get(compareKey(e.canonical, category)) ?? 0) > 1 ? POINTS_SHARED : POINTS_UNIQUE;
  }
  return points;
}

// Puntaje de una ronda completa: { categoría: entradas } → { jugador: { total, porCategoría } }
export function scoreRound(byCategory: Record<string, CategoryEntry[]>) {
  const result: Record<string, { total: number; byCategory: Record<string, number> }> = {};
  for (const [category, entries] of Object.entries(byCategory)) {
    const points = scoreCategory(entries, category);
    for (const [playerId, p] of Object.entries(points)) {
      result[playerId] ??= { total: 0, byCategory: {} };
      result[playerId].byCategory[category] = p;
      result[playerId].total += p;
    }
  }
  return result;
}
