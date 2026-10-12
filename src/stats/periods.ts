// Períodos de las ligas, en hora de Argentina (UTC−3 todo el año, sin horario de verano).
// La semana arranca el lunes a las 00:00 y el mes el día 1 a las 00:00 (hora argentina).

export const PERIODS = ['global', 'semanal', 'mensual', 'elo'] as const;
export type Period = (typeof PERIODS)[number];

const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

// Devuelve el instante (UTC) en que empezó el período que contiene "now". null = sin límite.
export function periodStart(period: Period, now = new Date()): Date | null {
  if (period !== 'semanal' && period !== 'mensual') return null;
  const ar = new Date(now.getTime() - AR_OFFSET_MS); // con los getters UTC leemos la hora argentina
  const y = ar.getUTCFullYear();
  const m = ar.getUTCMonth();
  const d = ar.getUTCDate();
  if (period === 'mensual') return new Date(Date.UTC(y, m, 1) + AR_OFFSET_MS);
  const daysSinceMonday = (ar.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(y, m, d - daysSinceMonday) + AR_OFFSET_MS);
}

// Día en Argentina como texto "AAAA-MM-DD" (lo usan los desafíos diarios)
export function argentinaDay(now = new Date()): string {
  return new Date(now.getTime() - AR_OFFSET_MS).toISOString().slice(0, 10);
}
