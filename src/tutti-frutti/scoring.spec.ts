import { CategoryEntry, scoreCategory, scoreRound } from './scoring';

const e = (playerId: string, status: CategoryEntry['status'], canonical: string | null): CategoryEntry => ({
  playerId,
  status,
  canonical,
});

describe('puntaje clásico', () => {
  it('20 si es el único con respuesta válida en la categoría', () => {
    expect(scoreCategory([e('a', 'valid', 'Lionel Messi'), e('b', 'invalid', null), e('c', 'empty', null)])).toEqual({
      a: 20,
      b: 0,
      c: 0,
    });
  });

  it('10 si es válida y nadie más puso la misma', () => {
    expect(scoreCategory([e('a', 'valid', 'Lionel Messi'), e('b', 'valid', 'Diego Maradona')])).toEqual({ a: 10, b: 10 });
  });

  it('5 si otro jugador puso la misma (comparando el nombre canónico, sin tildes ni mayúsculas)', () => {
    expect(
      scoreCategory([e('a', 'valid', 'Lionel Messi'), e('b', 'valid', 'LIONEL MESSI'), e('c', 'valid', 'Mascherano')]),
    ).toEqual({ a: 5, b: 5, c: 10 });
  });

  it('las respuestas sin validar valen 0 y no le quitan a nadie el "único"', () => {
    expect(scoreCategory([e('a', 'valid', 'Messi'), e('b', 'unverified', 'Messi')])).toEqual({ a: 20, b: 0 });
  });

  it('una respuesta inválida igual a otra válida no la convierte en repetida', () => {
    expect(scoreCategory([e('a', 'valid', 'Messi'), e('b', 'valid', 'Mbappé'), e('c', 'invalid', 'Messi')])).toEqual({
      a: 10,
      b: 10,
      c: 0,
    });
  });

  it('suma por jugador en toda la ronda', () => {
    const res = scoreRound({
      Jugador: [e('jugador', 'valid', 'Lionel Messi'), e('maquina', 'valid', 'Lionel Messi')],
      Equipo: [e('jugador', 'valid', 'Milan'), e('maquina', 'empty', null)],
      DT: [e('jugador', 'invalid', null), e('maquina', 'valid', 'José Mourinho')],
    });
    expect(res.jugador).toEqual({ total: 25, byCategory: { Jugador: 5, Equipo: 20, DT: 0 } });
    expect(res.maquina).toEqual({ total: 25, byCategory: { Jugador: 5, Equipo: 0, DT: 20 } });
  });
});
