// ELO de cada jugador. Arranca en 1000. Después de cada partida que cuenta:
//   nuevo = viejo + K × (resultado − esperado)
//   esperado = 1 / (1 + 10^((rival − yo) / 400))   (probabilidad de ganarle según el ELO)
//   resultado: 1 si ganaste, 0.5 si empataste, 0 si perdiste
// Ganarle a alguien con más ELO suma más; perder con alguien con menos ELO resta más.

export const ELO_START = 1000;
export const ELO_K = 32;
export const ELO_MIN = 100;

// Contra la máquina: ELO fijo según la dificultad
export const MACHINE_ELO: Record<string, number> = {
  facil: 800,
  medio: 1000,
  dificil: 1200,
  experto: 1400,
};

export function expectedScore(mine: number, rival: number): number {
  return 1 / (1 + Math.pow(10, (rival - mine) / 400));
}

const clamp = (elo: number) => Math.max(ELO_MIN, Math.round(elo));

// Partida contra la máquina
export function eloVsMachine(mine: number, difficulty: string, outcome: 'win' | 'draw' | 'loss'): number {
  const rival = MACHINE_ELO[difficulty] ?? MACHINE_ELO.medio;
  const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  return clamp(mine + ELO_K * (score - expectedScore(mine, rival)));
}

export interface EloPlayer {
  userId: string;
  elo: number;
  points: number;
  abandoned: boolean;
}

// Multijugador: cada jugador "juega" contra cada uno de los otros (le gana al que hizo menos puntos,
// empata con el que hizo los mismos). El cambio se divide por la cantidad de rivales para que una
// partida de 8 no mueva 7 veces más que una de 2. El que abandonó pierde contra todos.
export function eloMultiplayer(players: EloPlayer[]): Record<string, number> {
  const result: Record<string, number> = {};
  const n = players.length;
  for (const p of players) {
    if (n < 2) {
      result[p.userId] = p.elo;
      continue;
    }
    let delta = 0;
    for (const q of players) {
      if (q.userId === p.userId) continue;
      let score: number;
      if (p.abandoned && q.abandoned) score = 0.5;
      else if (p.abandoned) score = 0;
      else if (q.abandoned) score = 1;
      else score = p.points > q.points ? 1 : p.points === q.points ? 0.5 : 0;
      delta += score - expectedScore(p.elo, q.elo);
    }
    result[p.userId] = clamp(p.elo + (ELO_K * delta) / (n - 1));
  }
  return result;
}
