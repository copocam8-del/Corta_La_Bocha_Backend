import { buildAiPlan, outcomeOf, revealedAiAnswers, scoreAi, seededRandom, TEMATICAS } from './solo-quick';

describe('reglas de la partida rápida', () => {
  it('el plan de la máquina es siempre el mismo para la misma partida', () => {
    const a = buildAiPlan('partida-1', 'M', TEMATICAS.general, 'medio');
    const b = buildAiPlan('partida-1', 'M', TEMATICAS.general, 'medio');
    expect(a).toEqual(b);
  });

  it('el generador con semilla da números entre 0 y 1', () => {
    const r = seededRandom('x');
    for (let i = 0; i < 100; i++) {
      const n = r();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('en experto la máquina no se equivoca y responde más rápido que en fácil', () => {
    const experto = buildAiPlan('p', 'M', TEMATICAS.general, 'experto');
    const facil = buildAiPlan('p', 'M', TEMATICAS.general, 'facil');
    expect(experto.every((i) => i.answer !== null)).toBe(true);
    expect(experto[0].delayMs).toBeLessThan(facil[0].delayMs);
  });

  it('con una letra que no conoce, la máquina no responde', () => {
    const plan = buildAiPlan('p', 'O', TEMATICAS.general, 'experto');
    expect(plan.every((i) => i.answer === null)).toBe(true);
  });

  it('sólo cuentan las respuestas que la máquina llegó a escribir a tiempo', () => {
    const plan = [
      { category: 'Jugador', answer: 'Messi', delayMs: 2000 },
      { category: 'Equipo', answer: 'Manchester', delayMs: 3500 },
      { category: 'DT', answer: null, delayMs: 5000 },
    ];
    expect(revealedAiAnswers(plan, 3000)).toEqual({ Jugador: 'Messi' });
    expect(revealedAiAnswers(plan, 60000)).toEqual({ Jugador: 'Messi', Equipo: 'Manchester' });
  });

  it('la máquina suma 10 por respuesta y 5 si coincide con la del jugador (sin importar tildes ni mayúsculas)', () => {
    expect(scoreAi({ Jugador: 'Messi', Equipo: 'Málaga' }, { Jugador: 'messi', Equipo: 'Monaco' })).toBe(15);
    expect(scoreAi({ Equipo: 'Málaga' }, { Equipo: 'MALAGA' })).toBe(5);
  });

  it('decide ganar, empatar o perder', () => {
    expect(outcomeOf(30, 20)).toBe('win');
    expect(outcomeOf(20, 20)).toBe('draw');
    expect(outcomeOf(10, 20)).toBe('loss');
  });
});
