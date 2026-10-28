// Catálogo de juegos de la plataforma. Para sumar uno nuevo:
//   1. agregalo acá (id único, nunca cambiar el id de uno existente: queda guardado en la base),
//   2. creá su módulo en src/<juego>/ que decida el resultado y los puntos EN EL SERVIDOR,
//   3. al terminar una partida llamá a GameResultsService.record() (estadísticas generales y del
//      juego, ligas y logros, todo en una transacción),
//   4. sumale 2 o 3 logros con game: '<id>' en achievements.definitions.ts.

export const GAME_IDS = ['tutti_frutti', 'ahorcado', 'trivia', 'trivia_diaria', 'sopa_de_letras', 'memotest', 'impostor', 'rosco'] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface GameInfo {
  id: GameId;
  name: string;
  description: string;
  available: boolean; // false = "Próximamente" en la pantalla de selección
  path: string; // pantalla del frontend para jugar solo
  multiplayer: boolean; // tiene salas con amigos y partida pública (menú "¿Cómo querés jugar?")
  hasElo: boolean; // mueve el ELO jugando solo (contra la máquina). En multijugador, todos lo mueven
}

export const GAMES: GameInfo[] = [
  {
    id: 'tutti_frutti',
    name: 'Tutti Frutti',
    description: 'Completá las categorías futboleras con la letra que salga. Contra la máquina o con amigos.',
    available: true,
    path: '/game-setup',
    multiplayer: true,
    hasElo: true,
  },
  {
    id: 'ahorcado',
    name: 'Que no muera la redonda',
    description: 'Ahorcado futbolero: adiviná el nombre antes de que se desinfle la pelota.',
    available: true,
    path: '/ahorcado',
    multiplayer: true,
    hasElo: false,
  },
  {
    id: 'trivia',
    name: 'Trivia',
    description: 'Preguntas de fútbol con 4 opciones. Sumás por acertar y por rapidez.',
    available: true,
    path: '/trivia',
    multiplayer: true,
    hasElo: false,
  },
  {
    id: 'trivia_diaria',
    name: 'Desafío del día',
    description: 'Las mismas preguntas para todos, una vez por día. Mantené tu racha.',
    available: true,
    path: '/desafio-diario',
    multiplayer: false,
    hasElo: false,
  },
  {
    id: 'sopa_de_letras',
    name: 'Sopa de letras',
    description: 'Encontrá los nombres futboleros escondidos en la grilla.',
    available: true,
    path: '/sopa-de-letras',
    multiplayer: true,
    hasElo: false,
  },
  {
    id: 'memotest',
    name: 'Memotest',
    description: 'Da vuelta las cartas y encontrá los pares futboleros.',
    available: true,
    path: '/memotest',
    multiplayer: true,
    hasElo: false,
  },
  {
    // Sin modo solo: "En persona" (un solo celular) u "Online" (salas de 3 a 8). Lanzado el 26/10/2026.
    id: 'impostor',
    name: 'El Impostor',
    description: 'Todos reciben el mismo jugador menos uno. Dá pistas, votá y descubrí al impostor.',
    available: true,
    path: '/juego/impostor',
    multiplayer: true,
    hasElo: false,
  },
  {
    // Próximamente (anunciado el 28/10/2026): todavía no tiene módulo ni pantalla. Cuando esté, pasar a available: true
    // y, si tiene salas, multiplayer: true + sumarlo a MULTI_GAMES.
    id: 'rosco',
    name: 'Rosco Futbolero',
    description: 'Una definición futbolera por cada letra del abecedario. Completá el rosco antes de que se acabe el tiempo.',
    available: false,
    path: '/rosco',
    multiplayer: false,
    hasElo: false,
  },
];

export const isGameId = (v: unknown): v is GameId => typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v);
export const gameInfo = (id: GameId) => GAMES.find((g) => g.id === id)!;
