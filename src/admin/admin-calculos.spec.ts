import {
  desdeDe, diaAR, inicioDelDiaAR, isPeriodoAdmin, MIN_VECES, palabrasDificiles, porcentaje, porDiaYJuego, rankingPreguntas,
  rellenarDias, resumenPartidas,
} from './admin-calculos';

// 13/10/2026 15:00 en Argentina = 18:00 UTC
const AHORA = new Date('2026-10-13T18:00:00Z');

describe('panel de administración: cuentas', () => {
  it('períodos en hora argentina: hoy desde la medianoche, 7 y 30 días contando hoy, todo desde siempre', () => {
    expect(inicioDelDiaAR(AHORA).toISOString()).toBe('2026-10-13T03:00:00.000Z');
    // A las 23:30 argentinas (02:30 UTC del día siguiente) sigue siendo "hoy"
    expect(inicioDelDiaAR(new Date('2026-10-14T02:30:00Z')).toISOString()).toBe('2026-10-13T03:00:00.000Z');
    expect(desdeDe('hoy', AHORA).toISOString()).toBe('2026-10-13T03:00:00.000Z');
    expect(desdeDe('7d', AHORA).toISOString()).toBe('2026-10-07T03:00:00.000Z');
    expect(desdeDe('30d', AHORA).toISOString()).toBe('2026-09-14T03:00:00.000Z');
    expect(desdeDe('todo', AHORA).getTime()).toBe(0);
    expect(diaAR(new Date('2026-10-14T02:30:00Z'))).toBe('2026-10-13');
    expect(['hoy', '7d', '30d', 'todo'].every(isPeriodoAdmin)).toBe(true);
    expect(isPeriodoAdmin('semana')).toBe(false);
  });

  it('nuevos por día: completa con 0 los días sin datos', () => {
    const dias = rellenarDias([{ dia: '2026-10-08', cantidad: 3 }, { dia: '2026-10-13', cantidad: 1 }], desdeDe('7d', AHORA), AHORA);
    expect(dias.map((d) => d.cantidad)).toEqual([0, 3, 0, 0, 0, 0, 1]);
    expect(dias[0].dia).toBe('2026-10-07');
    expect(dias.at(-1)!.dia).toBe('2026-10-13');
    // "todo": arranca el primer día con datos
    expect(rellenarDias([{ dia: '2026-10-11', cantidad: 2 }], desdeDe('todo', AHORA), AHORA).map((d) => d.dia)).toEqual([
      '2026-10-11', '2026-10-12', '2026-10-13',
    ]);
  });

  it('partidas por día y por juego', () => {
    const filas = [
      { dia: '2026-10-12', game: 'trivia', cantidad: 2 },
      { dia: '2026-10-12', game: 'ahorcado', cantidad: 1 },
      { dia: '2026-10-13', game: 'trivia', cantidad: 4 },
    ];
    expect(porDiaYJuego(filas, desdeDe('hoy', AHORA), AHORA)).toEqual([{ dia: '2026-10-13', total: 4, juegos: { trivia: 4 } }]);
    expect(porDiaYJuego(filas, desdeDe('todo', AHORA), AHORA)).toEqual([
      { dia: '2026-10-12', total: 3, juegos: { trivia: 2, ahorcado: 1 } },
      { dia: '2026-10-13', total: 4, juegos: { trivia: 4 } },
    ]);
  });

  it('resumen de partidas: por juego, solo vs multijugador y abandonadas', () => {
    const r = resumenPartidas([
      { game: 'tutti_frutti', mode: 'vs_ai', status: 'finished', cantidad: 5 },
      { game: 'tutti_frutti', mode: 'vs_ai', status: 'abandoned', cantidad: 2 },
      { game: 'tutti_frutti', mode: 'multiplayer', status: 'finished', cantidad: 3 },
      { game: 'trivia', mode: 'solo', status: 'finished', cantidad: 4 },
    ]);
    expect(r).toMatchObject({ total: 14, solo: 11, multijugador: 3, abandonadas: 2 });
    expect(r.porJuego.tutti_frutti).toEqual({ total: 10, solo: 7, multijugador: 3, abandonadas: 2 });
    expect(r.porJuego.trivia).toEqual({ total: 4, solo: 4, multijugador: 0, abandonadas: 0 });
  });

  it('porcentaje con un decimal y sin dividir por 0', () => {
    expect(porcentaje(1, 3)).toBe(33.3);
    expect(porcentaje(0, 0)).toBe(0);
  });

  it(`preguntas más falladas y más acertadas (al menos ${MIN_VECES} veces)`, () => {
    const r = rankingPreguntas(
      [
        { id: 'a', veces: 10, aciertos: 2 },
        { id: 'b', veces: 4, aciertos: 4 },
        { id: 'c', veces: 2, aciertos: 0 }, // pocas veces: no entra
        { id: 'd', veces: 5, aciertos: 3 },
      ],
      (id) => ({ a: '¿Pregunta A?' })[id],
    );
    expect(r.masFalladas.map((p) => [p.id, p.porcentaje, p.veces])).toEqual([['a', 20, 10], ['d', 60, 5], ['b', 100, 4]]);
    expect(r.masAcertadas[0]).toEqual({ id: 'b', texto: 'b', veces: 4, porcentaje: 100 });
    expect(r.masFalladas[0].texto).toBe('¿Pregunta A?');
  });

  it('palabras del ahorcado más difíciles: % de derrotas', () => {
    const r = palabrasDificiles([
      { palabra: 'MESSI', jugadas: 10, derrotas: 1 },
      { palabra: 'OFFSIDE', jugadas: 4, derrotas: 3 },
      { palabra: 'TRIANGULACION', jugadas: 1, derrotas: 1 },
    ]);
    expect(r.map((p) => [p.texto, p.porcentaje])).toEqual([['OFFSIDE', 75], ['MESSI', 10]]);
  });
});
