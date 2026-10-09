import { AI_ANSWER_BANK } from './ai-answer-bank';

// Reglas de la partida rápida contra la máquina (una ronda), decididas en el servidor.
// Antes vivían en el frontend (Game.tsx); se movieron acá para que nadie pueda inventarse
// una victoria desde el navegador.

export const TEMATICAS: Record<string, string[]> = {
  general: ['Jugador', 'Equipo', 'DT', 'Selección', 'Campeón Champions', 'Campeón Mundial', 'Jugador Argentino'],
  liga_argentina: ['Jugador Arg', 'Equipo Arg', 'DT Arg', 'Estadio', 'Apodo Club', 'Jugador Histórico', 'Clásico'],
  mundial: ['Jugador', 'DT', 'Selección', 'Goleador', 'País Sede', 'Selección Campeona'],
  champions: ['Jugador', 'DT', 'Equipo', 'Goleador', 'Equipo Campeón', 'Jugador Promesa', 'Clásico'],
  libertadores: ['Jugador', 'DT', 'Equipo', 'Goleador', 'Jugador Histórico', 'Equipo Campeón', 'Clásico'],
};

// Qué tan buena es la máquina en cada dificultad:
//   sabe      → probabilidad de que sepa una respuesta para cada categoría (si el banco tiene alguna)
//   primeraMs → cuándo escribe su primera respuesta; entreMs → cada cuánto escribe las siguientes
//   azarMs    → variación al azar para que no escriba como un reloj
export const DIFICULTADES = {
  facil: { sabe: 0.5, primeraMs: 15000, entreMs: 6000, azarMs: 4000 },
  medio: { sabe: 0.7, primeraMs: 9000, entreMs: 4000, azarMs: 3000 },
  dificil: { sabe: 0.85, primeraMs: 5000, entreMs: 2500, azarMs: 2000 },
  experto: { sabe: 0.97, primeraMs: 2500, entreMs: 1500, azarMs: 1000 },
} as const;

export type Dificultad = keyof typeof DIFICULTADES;

export const ROUND_SECONDS = [60, 120] as const;

// Letras que se sortean (las mismas que usaba el frontend)
export const LETRAS = 'ABCDEFLMNOPRSTV'.split('');

export interface AiPlanItem {
  category: string;
  answer: string | null; // null = la máquina no sabe / se equivoca
  delayMs: number; // a los cuántos ms de empezada la ronda aparece la respuesta
}

// Generador pseudoaleatorio con semilla: con el mismo id de partida da siempre el mismo
// resultado, así el servidor puede recalcular el plan de la máquina al terminar sin guardarlo.
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Plan de la máquina: para cada categoría, qué responde (del banco, según categoría y letra) y
// cuándo. Con la misma semilla (id de partida) da siempre el mismo plan.
export function buildAiPlan(seed: string, letter: string, categories: string[], dificultad: Dificultad): AiPlanItem[] {
  const random = seededRandom(seed);
  const config = DIFICULTADES[dificultad] ?? DIFICULTADES.medio;
  return categories.map((category, i) => {
    const options = AI_ANSWER_BANK[category]?.[letter] ?? [];
    const knows = options.length > 0 && random() < config.sabe;
    const pick = options[Math.floor(random() * options.length)];
    const jitter = Math.floor(random() * config.azarMs);
    return {
      category,
      answer: knows ? pick : null,
      delayMs: config.primeraMs + i * config.entreMs + jitter,
    };
  });
}

// Respuestas que la máquina llegó a escribir antes de que terminara la ronda
export function revealedAiAnswers(plan: AiPlanItem[], elapsedMs: number): Record<string, string> {
  const revealed: Record<string, string> = {};
  for (const item of plan) {
    if (item.answer && item.delayMs <= elapsedMs) revealed[item.category] = item.answer;
  }
  return revealed;
}

export type Outcome = 'win' | 'draw' | 'loss';

export function outcomeOf(playerPoints: number, aiPoints: number): Outcome {
  if (playerPoints > aiPoints) return 'win';
  if (playerPoints === aiPoints) return 'draw';
  return 'loss';
}
