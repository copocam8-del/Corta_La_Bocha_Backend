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

export const DIFICULTADES = {
  facil: { delayMs: 15000, errores: 0.4 },
  medio: { delayMs: 8000, errores: 0.2 },
  dificil: { delayMs: 4000, errores: 0.1 },
  experto: { delayMs: 2000, errores: 0 },
} as const;

export type Dificultad = keyof typeof DIFICULTADES;

export const ROUND_SECONDS = [60, 120] as const;

// Letras que se sortean (las mismas que usaba el frontend)
export const LETRAS = 'ABCDEFLMNOPRSTV'.split('');

// Respuestas que "sabe" la máquina, por letra. Para letras sin lista, la máquina no responde.
const IA_RESPUESTAS: Record<string, string[]> = {
  A: ['Agüero', 'Ajax', 'Ancelotti', 'Argentina', 'Abidal', 'Ayala', 'Aimar'],
  B: ['Benzema', 'Barcelona', 'Bielsa', 'Brasil', 'Busquets', 'Batistuta', 'Banega'],
  C: ['Cristiano', 'Chelsea', 'Capello', 'Colombia', 'Casillas', 'Caniggia', 'Crespo'],
  D: ['Di María', 'Dortmund', 'Del Bosque', 'Dinamarca', 'Drogba', "D'Alessandro", 'Díaz'],
  M: ['Messi', 'Manchester', 'Mourinho', 'México', 'Maldini', 'Maradona', 'Mascherano'],
  R: ['Ronaldo', 'Real Madrid', 'Rijkaard', 'Rumania', 'Ramos', 'Redondo', 'Riquelme'],
  S: ['Suárez', 'Sevilla', 'Scolari', 'Serbia', 'Schmeichel', 'Simeone', 'Saviola'],
  T: ['Tevez', 'Tottenham', 'Tuchel', 'Túnez', 'Terry', 'Trezeguet', 'Tapia'],
  V: ['Vinicius', 'Valencia', 'Valdano', 'Venezuela', 'Vidal', 'Verón', 'Vargas'],
};

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

export function buildAiPlan(seed: string, letter: string, categories: string[], dificultad: Dificultad): AiPlanItem[] {
  const random = seededRandom(seed);
  const config = DIFICULTADES[dificultad];
  const pool = IA_RESPUESTAS[letter] ?? [];
  return categories.map((category, i) => {
    const fails = random() < config.errores;
    return {
      category,
      answer: fails ? null : (pool[i] ?? null),
      delayMs: config.delayMs + i * 1500,
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

export const normalizeAnswer = (s: string | null | undefined) =>
  (s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Puntaje de la máquina: 10 por respuesta, 5 si coincide con la del jugador
export function scoreAi(aiAnswers: Record<string, string>, playerAnswers: Record<string, string | null>): number {
  let points = 0;
  for (const [category, answer] of Object.entries(aiAnswers)) {
    points += normalizeAnswer(answer) === normalizeAnswer(playerAnswers[category]) ? 5 : 10;
  }
  return points;
}

export type Outcome = 'win' | 'draw' | 'loss';

export function outcomeOf(playerPoints: number, aiPoints: number): Outcome {
  if (playerPoints > aiPoints) return 'win';
  if (playerPoints === aiPoints) return 'draw';
  return 'loss';
}
