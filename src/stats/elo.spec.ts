import { ELO_K, ELO_MIN, eloMultiplayer, eloVsMachine, expectedScore, MACHINE_ELO } from './elo';

describe('ELO', () => {
  it('la máquina tiene ELO fijo por dificultad', () => {
    expect(MACHINE_ELO).toEqual({ facil: 800, medio: 1000, dificil: 1200, experto: 1400 });
  });

  it('contra un rival igual: ganar suma K/2, perder resta K/2, empatar no cambia', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
    expect(eloVsMachine(1000, 'medio', 'win')).toBe(1000 + ELO_K / 2);
    expect(eloVsMachine(1000, 'medio', 'loss')).toBe(1000 - ELO_K / 2);
    expect(eloVsMachine(1000, 'medio', 'draw')).toBe(1000);
  });

  it('ganarle al experto suma mucho más que ganarle al fácil; perder con el fácil resta mucho', () => {
    const vsExperto = eloVsMachine(1000, 'experto', 'win') - 1000;
    const vsFacil = eloVsMachine(1000, 'facil', 'win') - 1000;
    expect(vsExperto).toBeGreaterThan(25);
    expect(vsFacil).toBeLessThan(10);
    expect(1000 - eloVsMachine(1000, 'facil', 'loss')).toBeGreaterThan(20); // resta 24
  });

  it('nunca baja de un mínimo', () => {
    expect(eloVsMachine(ELO_MIN, 'facil', 'loss')).toBe(ELO_MIN);
  });

  it('multijugador entre iguales: el primero sube, el último baja y la suma se mantiene', () => {
    const r = eloMultiplayer([
      { userId: 'a', elo: 1000, points: 90, abandoned: false },
      { userId: 'b', elo: 1000, points: 50, abandoned: false },
      { userId: 'c', elo: 1000, points: 10, abandoned: false },
    ]);
    expect(r.a).toBe(1016);
    expect(r.b).toBe(1000);
    expect(r.c).toBe(984);
    expect(r.a + r.b + r.c).toBe(3000);
  });

  it('empate en puntos entre iguales: nadie cambia', () => {
    const r = eloMultiplayer([
      { userId: 'a', elo: 1000, points: 30, abandoned: false },
      { userId: 'b', elo: 1000, points: 30, abandoned: false },
    ]);
    expect(r).toEqual({ a: 1000, b: 1000 });
  });

  it('empate en el primer puesto: 0,5 entre los empatados y victoria contra el de abajo', () => {
    const r = eloMultiplayer([
      { userId: 'a', elo: 1000, points: 50, abandoned: false },
      { userId: 'b', elo: 1000, points: 50, abandoned: false },
      { userId: 'c', elo: 1000, points: 10, abandoned: false },
    ]);
    // a: (0,5 − 0,5) contra b + (1 − 0,5) contra c = 0,5 → 32 × 0,5 / 2 = +8
    expect(r).toEqual({ a: 1008, b: 1008, c: 984 });
  });

  it('ganarle a alguien con más ELO suma más', () => {
    const vsFuerte = eloMultiplayer([
      { userId: 'a', elo: 1000, points: 50, abandoned: false },
      { userId: 'b', elo: 1400, points: 10, abandoned: false },
    ]);
    const vsDebil = eloMultiplayer([
      { userId: 'a', elo: 1000, points: 50, abandoned: false },
      { userId: 'b', elo: 600, points: 10, abandoned: false },
    ]);
    expect(vsFuerte.a - 1000).toBeGreaterThan(vsDebil.a - 1000);
  });

  it('el que abandona pierde contra todos aunque haya sumado puntos', () => {
    const r = eloMultiplayer([
      { userId: 'a', elo: 1000, points: 10, abandoned: false },
      { userId: 'b', elo: 1000, points: 80, abandoned: true },
    ]);
    expect(r.a).toBeGreaterThan(1000);
    expect(r.b).toBeLessThan(1000);
  });
});
