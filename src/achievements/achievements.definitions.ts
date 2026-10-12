// Definición de los logros. Para agregar uno: sumalo a esta lista (id único, nunca reutilizar ni
// cambiar el id de uno existente porque ya está guardado en la base) y, si hace falta, agregá el
// dato que necesita a AchievementContext. El ícono se elige en el frontend por id.

import type { GameId } from '../games/games';

export interface AchievementContext {
  // Estadísticas generales del perfil DESPUÉS de sumar la partida que acaba de terminar
  matchesPlayed: number;
  matchesWon: number;
  totalPoints: number;
  currentStreak: number;
  // Datos de la partida que acaba de terminar
  game?: GameId; // por defecto tutti_frutti
  mode: 'vs_ai' | 'multiplayer' | 'solo';
  won: boolean;
  aiDifficulty?: string | null;
  allAnswersValid?: boolean; // todas las categorías respondidas y válidas
  points?: number; // puntos de esta partida
  // Estadísticas del juego DESPUÉS de sumar la partida
  gameMatchesPlayed?: number;
  gameMatchesWon?: number;
  gameTotalPoints?: number;
  gameCurrentStreak?: number;
  // Datos propios de cada juego (ej. errores en el ahorcado, segundos que tardó)
  extra?: Record<string, number | boolean | string>;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  // Si tiene juego, sólo se revisa con partidas de ese juego. Sin juego = logro general.
  game?: GameId;
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
    game: 'tutti_frutti',
    isUnlocked: (c) => c.mode === 'vs_ai' && c.allAnswersValid === true,
  },
  {
    id: 'le_ganaste_a_la_maquina',
    name: 'Le ganaste a la máquina',
    description: 'Ganale a la máquina en dificultad Experto.',
    game: 'tutti_frutti',
    isUnlocked: (c) => c.mode === 'vs_ai' && c.won && c.aiDifficulty === 'experto',
  },
  {
    id: 'campeon_del_barrio',
    name: 'Campeón del barrio',
    description: 'Ganá una partida multijugador.',
    game: 'tutti_frutti',
    isUnlocked: (c) => c.mode === 'multiplayer' && c.won,
  },
  // ── Ahorcado "Que no muera la redonda" ──
  {
    id: 'redonda_intacta',
    name: 'La redonda intacta',
    description: 'Ganá un ahorcado sin ningún error.',
    game: 'ahorcado',
    isUnlocked: (c) => c.won && c.extra?.errores === 0,
  },
  {
    id: 'ahorcado_crack',
    name: 'Crack del ahorcado',
    description: 'Ganá un ahorcado en dificultad Difícil.',
    game: 'ahorcado',
    isUnlocked: (c) => c.won && c.extra?.dificultad === 'dificil',
  },
  {
    id: 'ahorcado_diez',
    name: 'Inflador oficial',
    description: 'Ganá 10 partidas de ahorcado.',
    game: 'ahorcado',
    isUnlocked: (c) => (c.gameMatchesWon ?? 0) >= 10,
  },
  // ── Trivia ──
  {
    id: 'trivia_perfecta',
    name: 'Enciclopedia futbolera',
    description: 'Respondé bien todas las preguntas de una trivia.',
    game: 'trivia',
    isUnlocked: (c) => typeof c.extra?.aciertos === 'number' && c.extra.aciertos === c.extra.total,
  },
  {
    id: 'trivia_rapida',
    name: 'Rápido de reflejos',
    description: 'Acertá 8 o más preguntas de una trivia respondiendo en menos de 6 segundos en promedio.',
    game: 'trivia',
    isUnlocked: (c) => Number(c.extra?.aciertos ?? 0) >= 8 && Number(c.extra?.promedioSegundos ?? 99) < 6,
  },
  {
    id: 'trivia_diez',
    name: 'Profe de fútbol',
    description: 'Aprobá 10 trivias (6 o más aciertos).',
    game: 'trivia',
    isUnlocked: (c) => (c.gameMatchesWon ?? 0) >= 10,
  },
  // ── Desafío del día ──
  {
    id: 'diaria_perfecta',
    name: 'Día perfecto',
    description: 'Respondé bien todas las preguntas del desafío del día.',
    game: 'trivia_diaria',
    isUnlocked: (c) => typeof c.extra?.aciertos === 'number' && c.extra.aciertos === c.extra.total,
  },
  {
    id: 'diaria_racha_7',
    name: 'Semana completa',
    description: 'Jugá el desafío del día 7 días seguidos.',
    game: 'trivia_diaria',
    isUnlocked: (c) => Number(c.extra?.racha ?? 0) >= 7,
  },
  {
    id: 'diaria_racha_30',
    name: 'Abonado a la platea',
    description: 'Jugá el desafío del día 30 días seguidos.',
    game: 'trivia_diaria',
    isUnlocked: (c) => Number(c.extra?.racha ?? 0) >= 30,
  },
  // ── Sopa de letras ──
  {
    id: 'sopa_relampago',
    name: 'Ojo de lince',
    description: 'Encontrá todas las palabras de una sopa de letras en menos de un minuto.',
    game: 'sopa_de_letras',
    isUnlocked: (c) => c.won && Number(c.extra?.segundos ?? 999) < 60,
  },
  {
    id: 'sopa_dificil',
    name: 'Sopa de campeón',
    description: 'Completá una sopa de letras en dificultad Difícil.',
    game: 'sopa_de_letras',
    isUnlocked: (c) => c.won && c.extra?.dificultad === 'dificil',
  },
  {
    id: 'sopa_diez',
    name: 'Buscador incansable',
    description: 'Completá 10 sopas de letras.',
    game: 'sopa_de_letras',
    isUnlocked: (c) => (c.gameMatchesWon ?? 0) >= 10,
  },
  // ── Memotest ──
  {
    id: 'memotest_elefante',
    name: 'Memoria de elefante',
    description: 'Completá un memotest con, como mucho, 2 intentos fallidos.',
    game: 'memotest',
    isUnlocked: (c) => c.won && Number(c.extra?.movimientos ?? 99) <= Number(c.extra?.pares ?? 0) + 2,
  },
  {
    id: 'memotest_dificil',
    name: 'Memoria de crack',
    description: 'Completá un memotest en el nivel Difícil.',
    game: 'memotest',
    isUnlocked: (c) => c.won && c.extra?.nivel === 'dificil',
  },
  {
    id: 'memotest_diez',
    name: 'No me olvido de nada',
    description: 'Completá 10 memotests.',
    game: 'memotest',
    isUnlocked: (c) => (c.gameMatchesWon ?? 0) >= 10,
  },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
