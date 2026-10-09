import { buildAiPlan, DIFICULTADES, LETRAS, outcomeOf, revealedAiAnswers, seededRandom, TEMATICAS } from './solo-quick';
import { AI_ANSWER_BANK } from './ai-answer-bank';

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

  it('la máquina responde según la CATEGORÍA y la letra (nunca "Ajax" en Estadio)', () => {
    for (const [tematica, categorias] of Object.entries(TEMATICAS)) {
      for (const letra of LETRAS) {
        const plan = buildAiPlan(`${tematica}-${letra}`, letra, categorias, 'experto');
        for (const item of plan) {
          if (item.answer) expect(AI_ANSWER_BANK[item.category][letra]).toContain(item.answer);
        }
      }
    }
  });

  it('si el banco no tiene respuesta para esa categoría y letra, la máquina no responde', () => {
    const plan = buildAiPlan('p', 'L', ['País Sede'], 'experto');
    expect(plan[0].answer).toBeNull();
  });

  it('a mayor dificultad sabe más respuestas y escribe más rápido', () => {
    const contar = (dif: keyof typeof DIFICULTADES) => {
      let sabe = 0;
      let demora = 0;
      for (let i = 0; i < 200; i++) {
        const plan = buildAiPlan(`semilla-${i}`, 'M', TEMATICAS.general, dif);
        sabe += plan.filter((p) => p.answer).length;
        demora += plan[0].delayMs;
      }
      return { sabe, demora };
    };
    const facil = contar('facil');
    const experto = contar('experto');
    expect(experto.sabe).toBeGreaterThan(facil.sabe);
    expect(experto.demora).toBeLessThan(facil.demora);
  });

  it('sólo cuentan las respuestas que la máquina llegó a escribir a tiempo', () => {
    const plan = [
      { category: 'Jugador', answer: 'Messi', delayMs: 2000 },
      { category: 'Equipo', answer: 'Milan', delayMs: 3500 },
      { category: 'DT', answer: null, delayMs: 5000 },
    ];
    expect(revealedAiAnswers(plan, 3000)).toEqual({ Jugador: 'Messi' });
    expect(revealedAiAnswers(plan, 60000)).toEqual({ Jugador: 'Messi', Equipo: 'Milan' });
  });

  it('decide ganar, empatar o perder', () => {
    expect(outcomeOf(30, 20)).toBe('win');
    expect(outcomeOf(20, 20)).toBe('draw');
    expect(outcomeOf(10, 20)).toBe('loss');
  });
});
