// Catálogo de juegos de la plataforma. Para sumar uno nuevo:
//   1. agregalo acá (id único, nunca cambiar el id de uno existente: queda guardado en la base),
//   2. creá su módulo en src/<juego>/ que decida el resultado y los puntos EN EL SERVIDOR,
//   3. al terminar una partida llamá a GameResultsService.record() (estadísticas generales y del
//      juego, ligas y logros, todo en una transacción),
//   4. sumale 2 o 3 logros con game: '<id>' en achievements.definitions.ts.

export const GAME_IDS = ['tutti_frutti', 'ahorcado', 'trivia', 'trivia_diaria', 'sopa_de_letras', 'memotest'] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface GameInfo {
  id: GameId;
  name: string;
  description: string;
  available: boolean; // false = "Próximamente" en la pantalla de selección
  path: string; // pantalla del frontend
  hasElo: boolean; // sólo los juegos con rival mueven el ELO
}

export const GAMES: GameInfo[] = [
  {
    id: 'tutti_frutti',
    name: 'Tutti Frutti',
    description: 'Completá las categorías futboleras con la letra que salga. Contra la máquina o con amigos.',
    available: true,
    path: '/lobby',
    hasElo: true,
  },
  {
    id: 'ahorcado',
    name: 'Que no muera la redonda',
    description: 'Ahorcado futbolero: adiviná el nombre antes de que se desinfle la pelota.',
    available: true,
    path: '/ahorcado',
    hasElo: false,
  },
  {
    id: 'trivia',
    name: 'Trivia',
    description: 'Preguntas de fútbol con 4 opciones. Sumás por acertar y por rapidez.',
    available: false,
    path: '/trivia',
    hasElo: false,
  },
  {
    id: 'trivia_diaria',
    name: 'Desafío del día',
    description: 'Las mismas preguntas para todos, una vez por día. Mantené tu racha.',
    available: false,
    path: '/desafio-diario',
    hasElo: false,
  },
  {
    id: 'sopa_de_letras',
    name: 'Sopa de letras',
    description: 'Encontrá los nombres futboleros escondidos en la grilla.',
    available: false,
    path: '/sopa-de-letras',
    hasElo: false,
  },
  {
    id: 'memotest',
    name: 'Memotest',
    description: 'Da vuelta las cartas y encontrá los pares futboleros.',
    available: false,
    path: '/memotest',
    hasElo: false,
  },
];

export const isGameId = (v: unknown): v is GameId => typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v);
export const gameInfo = (id: GameId) => GAMES.find((g) => g.id === id)!;
