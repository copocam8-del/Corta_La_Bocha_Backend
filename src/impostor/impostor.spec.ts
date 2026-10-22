import { BANCO_IMPOSTOR } from './impostor-bank';
import {
  CATEGORIAS_IMPOSTOR, compactar, contieneLaPalabra, elegirImpostor, esLaPalabra, limpiarTexto, masVotado, mezclar, palabrasDe,
} from './impostor-rules';

describe('banco de El Impostor', () => {
  it('tiene al menos 40 palabras por categoría', () => {
    for (const c of CATEGORIAS_IMPOSTOR) expect(BANCO_IMPOSTOR[c].length).toBeGreaterThanOrEqual(40);
  });

  it('no hay repetidos en todo el banco (el texto es el id de "contenido visto")', () => {
    const todos = palabrasDe('mezcla').map((w) => compactar(w.texto));
    expect(new Set(todos).size).toBe(todos.length);
  });

  it('cada palabra y alias tiene letras y entra en contenido_visto (item_id)', () => {
    for (const w of palabrasDe('mezcla')) {
      expect(compactar(w.texto).length).toBeGreaterThanOrEqual(2);
      expect(w.texto.length).toBeLessThanOrEqual(100);
      for (const a of w.alias ?? []) expect(compactar(a).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('mezcla = todas las categorías; cada palabra sabe de qué categoría es', () => {
    expect(palabrasDe('mezcla').length).toBe(CATEGORIAS_IMPOSTOR.reduce((n, c) => n + BANCO_IMPOSTOR[c].length, 0));
    expect(palabrasDe('dt').every((w) => w.categoria === 'dt')).toBe(true);
  });
});

describe('reglas de El Impostor', () => {
  const messi = { texto: 'Messi', alias: ['Lionel Messi'] };
  const boca = { texto: 'Boca Juniors', alias: ['Boca'] };

  it('una pista no puede tener la palabra (sin tildes, mayúsculas, espacios ni signos)', () => {
    expect(contieneLaPalabra('el mejor, MESSÍ', messi)).toBe(true);
    expect(contieneLaPalabra('m e s s i', messi)).toBe(true);
    expect(contieneLaPalabra('se llama lionel', messi)).toBe(true); // palabra del alias
    expect(contieneLaPalabra('zurdo y rosarino', messi)).toBe(false);
    expect(contieneLaPalabra('azul y oro, la boca', boca)).toBe(true);
    expect(contieneLaPalabra('de la ribera', boca)).toBe(false); // "de", "la" no cuentan
  });

  it('la adivinanza vale con el nombre o un alias, sin tildes ni mayúsculas', () => {
    expect(esLaPalabra('messi', messi)).toBe(true);
    expect(esLaPalabra('  LIONEL   messi ', messi)).toBe(true);
    expect(esLaPalabra('Leo', messi)).toBe(false);
    expect(esLaPalabra('', messi)).toBe(false);
    expect(esLaPalabra('Di Maria', { texto: 'Di María' })).toBe(true);
  });

  it('limpiarTexto sólo acepta texto', () => {
    expect(limpiarTexto('  hola   che ')).toBe('hola che');
    for (const raro of [null, undefined, 5, {}, ['a'], true]) expect(limpiarTexto(raro)).toBeNull();
  });

  it('el más votado sólo si es uno; empate o sin votos = nadie', () => {
    expect(masVotado(new Map([['a', 'c'], ['b', 'c'], ['c', 'a']]))).toBe('c');
    expect(masVotado(new Map([['a', 'c'], ['c', 'a']]))).toBeNull();
    expect(masVotado(new Map())).toBeNull();
  });

  it('el impostor se elige entre los que menos veces lo fueron', () => {
    const veces = new Map([['a', 1], ['b', 1]]);
    for (let i = 0; i < 20; i++) expect(elegirImpostor(['a', 'b', 'c'], veces, Math.random)).toBe('c');
    expect(['a', 'b']).toContain(elegirImpostor(['a', 'b'], veces, Math.random));
  });

  it('mezclar no pierde ni repite a nadie', () => {
    expect(mezclar(['a', 'b', 'c', 'd']).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
