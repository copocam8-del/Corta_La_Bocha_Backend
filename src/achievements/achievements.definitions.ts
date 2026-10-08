// Definición de los logros. Para agregar uno: sumalo a esta lista (id único, nunca reutilizar ni
// cambiar el id de uno existente porque ya está guardado en la base) y, si hace falta, agregá el
// dato que necesita a AchievementContext. El ícono se elige en el frontend por id.

export interface AchievementContext {
  // Estadísticas del perfil DESPUÉS de sumar la partida que acaba de terminar
  matchesPlayed: number;
  matchesWon: number;
  totalPoints: number;
  currentStreak: number;
  // Datos de la partida que acaba de terminar
  mode: 'vs_ai' | 'multiplayer';
  won: boolean;
  aiDifficulty?: string | null;
  allAnswersValid?: boolean; // todas las categorías respondidas y válidas
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  isUnlocked: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'debut',
    name: 'Debut',
    description: 'Jugá tu primera partida.',
    isUnlocked: (c) => c.matchesPlayed >= 1,
  },
  {
    id: 'primer_gol',
    name: 'Primer gol',
    description: 'Ganá tu primera partida.',
    isUnlocked: (c) => c.matchesWon >= 1,
  },
  {
    id: 'titular',
    name: 'Titular indiscutido',
    description: 'Jugá 10 partidas.',
    isUnlocked: (c) => c.matchesPlayed >= 10,
  },
  {
    id: 'idolo',
    name: 'Ídolo del club',
    description: 'Jugá 50 partidas.',
    isUnlocked: (c) => c.matchesPlayed >= 50,
  },
  {
    id: 'goleador',
    name: 'Goleador',
    description: 'Ganá 10 partidas.',
    isUnlocked: (c) => c.matchesWon >= 10,
  },
  {
    id: 'hat_trick',
    name: 'Hat-trick',
    description: 'Ganá 3 partidas seguidas.',
    isUnlocked: (c) => c.currentStreak >= 3,
  },
  {
    id: 'imparable',
    name: 'Imparable',
    description: 'Ganá 5 partidas seguidas.',
    isUnlocked: (c) => c.currentStreak >= 5,
  },
  {
    id: 'centenario',
    name: 'Centenario',
    description: 'Sumá 100 puntos en total.',
    isUnlocked: (c) => c.totalPoints >= 100,
  },
  {
    id: 'botin_de_oro',
    name: 'Botín de oro',
    description: 'Sumá 1000 puntos en total.',
    isUnlocked: (c) => c.totalPoints >= 1000,
  },
  {
    id: 'pleno',
    name: 'Pleno',
    description: 'Respondé bien todas las categorías de una partida contra la máquina.',
    isUnlocked: (c) => c.mode === 'vs_ai' && c.allAnswersValid === true,
  },
  {
    id: 'le_ganaste_a_la_maquina',
    name: 'Le ganaste a la máquina',
    description: 'Ganale a la máquina en dificultad Experto.',
    isUnlocked: (c) => c.mode === 'vs_ai' && c.won && c.aiDifficulty === 'experto',
  },
  {
    id: 'campeon_del_barrio',
    name: 'Campeón del barrio',
    description: 'Ganá una partida multijugador.',
    isUnlocked: (c) => c.mode === 'multiplayer' && c.won,
  },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
