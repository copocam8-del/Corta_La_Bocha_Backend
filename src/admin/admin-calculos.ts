// Cuentas del panel de administración que no dependen de la base (así se pueden probar solas).
// Las fechas de la base son TIMESTAMP sin zona horaria en UTC; los días se cuentan en hora argentina.

export const PERIODOS_ADMIN = ['hoy', '7d', '30d', 'todo'] as const;
export type PeriodoAdmin = (typeof PERIODOS_ADMIN)[number];

const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

// Gasto estimado de la IA por partida de Tutti Frutti validada (US$). Es un ESTIMADO.
export const COSTO_IA_POR_PARTIDA = 0.01;
// Para los rankings de contenido: mínimo de veces jugado para que el porcentaje diga algo
export const MIN_VECES = 3;

export function isPeriodoAdmin(p: unknown): p is PeriodoAdmin {
  return typeof p === 'string' && (PERIODOS_ADMIN as readonly string[]).includes(p);
}

// Medianoche argentina del día de "now" (en UTC)
export function inicioDelDiaAR(now: Date): Date {
  const ar = new Date(now.getTime() - AR_OFFSET_MS);
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate()) + AR_OFFSET_MS);
}

// Desde cuándo cuenta el período. "todo" = desde siempre (1970).
export function desdeDe(periodo: PeriodoAdmin, now = new Date()): Date {
  switch (periodo) {
    case 'hoy':
      return inicioDelDiaAR(now);
    case '7d':
      return new Date(inicioDelDiaAR(now).getTime() - 6 * DIA_MS); // hoy + los 6 días anteriores
    case '30d':
      return new Date(inicioDelDiaAR(now).getTime() - 29 * DIA_MS);
    default:
      return new Date(0);
  }
}

// "AAAA-MM-DD" del día argentino
export function diaAR(d: Date): string {
  return new Date(d.getTime() - AR_OFFSET_MS).toISOString().slice(0, 10);
}

// Completa con 0 los días sin datos, desde "desde" (o el primer día con datos si es "todo") hasta hoy
export function rellenarDias(filas: { dia: string; cantidad: number }[], desde: Date, now = new Date()): { dia: string; cantidad: number }[] {
  const porDia = new Map(filas.map((f) => [f.dia, f.cantidad]));
  const primero = desde.getTime() === 0 ? ([...porDia.keys()].sort()[0] ?? diaAR(now)) : diaAR(desde);
  const ultimo = diaAR(now);
  const out: { dia: string; cantidad: number }[] = [];
  for (let t = Date.parse(`${primero}T00:00:00Z`); ; t += DIA_MS) {
    const dia = new Date(t).toISOString().slice(0, 10);
    if (dia > ultimo) break;
    out.push({ dia, cantidad: porDia.get(dia) ?? 0 });
  }
  return out;
}

// Por día y por juego → una fila por día con la cantidad de cada juego (para el gráfico apilado)
export function porDiaYJuego(
  filas: { dia: string; game: string; cantidad: number }[],
  desde: Date,
  now = new Date(),
): { dia: string; total: number; juegos: Record<string, number> }[] {
  const dias = rellenarDias(
    filas.map((f) => ({ dia: f.dia, cantidad: 0 })),
    desde,
    now,
  );
  const mapa = new Map(dias.map((d) => [d.dia, { dia: d.dia, total: 0, juegos: {} as Record<string, number> }]));
  for (const f of filas) {
    const d = mapa.get(f.dia);
    if (!d) continue;
    d.juegos[f.game] = (d.juegos[f.game] ?? 0) + f.cantidad;
    d.total += f.cantidad;
  }
  return [...mapa.values()];
}

// Porcentaje con un decimal (0 si no hay base)
export function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;
}

// Partidas por juego: total, solo, multijugador y abandonadas
export function resumenPartidas(filas: { game: string; mode: string; status: string; cantidad: number }[]) {
  const porJuego: Record<string, { total: number; solo: number; multijugador: number; abandonadas: number }> = {};
  let solo = 0;
  let multijugador = 0;
  let abandonadas = 0;
  for (const f of filas) {
    const j = (porJuego[f.game] ??= { total: 0, solo: 0, multijugador: 0, abandonadas: 0 });
    j.total += f.cantidad;
    if (f.mode === 'multiplayer') {
      j.multijugador += f.cantidad;
      multijugador += f.cantidad;
    } else {
      j.solo += f.cantidad;
      solo += f.cantidad;
    }
    if (f.status === 'abandoned') {
      j.abandonadas += f.cantidad;
      abandonadas += f.cantidad;
    }
  }
  return { total: solo + multijugador, solo, multijugador, abandonadas, porJuego };
}

export interface ItemContenido {
  id: string;
  texto: string;
  veces: number;
  porcentaje: number;
}

// Preguntas de la trivia: más falladas (menos de 50% de acierto, de menor a mayor) y más acertadas
// (50% o más). Así una pregunta nunca está en las dos listas. Sólo las respondidas MIN_VECES veces o más.
export function rankingPreguntas(
  filas: { id: string; veces: number; aciertos: number }[],
  textoDe: (id: string) => string | undefined,
  limite = 10,
) {
  const items = filas
    .filter((f) => f.veces >= MIN_VECES)
    .map((f) => ({ id: f.id, texto: textoDe(f.id) ?? f.id, veces: f.veces, porcentaje: porcentaje(f.aciertos, f.veces) }));
  const masFalladas = items.filter((p) => p.porcentaje < 50).sort((a, b) => a.porcentaje - b.porcentaje || b.veces - a.veces).slice(0, limite);
  const masAcertadas = items.filter((p) => p.porcentaje >= 50).sort((a, b) => b.porcentaje - a.porcentaje || b.veces - a.veces).slice(0, limite);
  return { masFalladas, masAcertadas };
}

// Palabras del ahorcado más difíciles: mayor % de derrotas (al menos MIN_VECES partidas)
export function palabrasDificiles(filas: { palabra: string; jugadas: number; derrotas: number }[], limite = 10): ItemContenido[] {
  return filas
    .filter((f) => f.jugadas >= MIN_VECES)
    .map((f) => ({ id: f.palabra, texto: f.palabra, veces: f.jugadas, porcentaje: porcentaje(f.derrotas, f.jugadas) }))
    .sort((a, b) => b.porcentaje - a.porcentaje || b.veces - a.veces)
    .slice(0, limite);
}

// Prisma devuelve los COUNT de SQL como bigint: los pasamos a number
export const n = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : Number(v ?? 0));
