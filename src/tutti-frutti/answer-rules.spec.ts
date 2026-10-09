import { compareKey, normalizeText, precheckAnswer, stripIgnoredPrefixes } from './answer-rules';

describe('reglas de respuesta (antes de la IA)', () => {
  it('normaliza tildes, mayúsculas, signos y espacios', () => {
    expect(normalizeText('  Di  MARÍA! ')).toBe('di maria');
    expect(normalizeText("Eto'o")).toBe('eto o');
    expect(normalizeText(null)).toBe('');
  });

  it('ignora artículos y "Club" al principio, pero nunca deja la respuesta vacía', () => {
    expect(stripIgnoredPrefixes('la bombonera')).toBe('bombonera');
    expect(stripIgnoredPrefixes('club atletico river plate')).toBe('atletico river plate');
    expect(stripIgnoredPrefixes('los')).toBe('los');
  });

  it.each([
    ['Messi', 'M'],
    ['messi', 'M'],
    ['Ángel Di María', 'A'],
    ['El Monumental', 'M'],
    ['La Bombonera', 'B'],
    ['Club Atlético Lanús', 'A'],
    ['Lo Celso', 'L'],
  ])('"%s" empieza con %s', (respuesta, letra) => {
    expect(precheckAnswer(respuesta, letra).ok).toBe(true);
  });

  it('con artículo vale tanto la letra del artículo como la de la palabra siguiente (hay apellidos como "La Volpe")', () => {
    expect(precheckAnswer('La Bombonera', 'B').ok).toBe(true);
    expect(precheckAnswer('La Bombonera', 'L').ok).toBe(true);
    expect(precheckAnswer('La Volpe', 'L').ok).toBe(true);
    expect(precheckAnswer('La Bombonera', 'M').ok).toBe(false);
  });

  it('en Estadio no cuenta la palabra "Estadio"; en Clásico no cuentan "Clásico", "Derbi", "de"', () => {
    expect(precheckAnswer('Estadio Monumental', 'M', 'Estadio').ok).toBe(true);
    expect(precheckAnswer('Estadio Monumental', 'E', 'Estadio').ok).toBe(false);
    expect(precheckAnswer('Clásico de Avellaneda', 'A', 'Clásico').ok).toBe(true);
    expect(precheckAnswer('Derbi de Milán', 'M', 'Clásico').ok).toBe(true);
    expect(precheckAnswer('Superclásico', 'S', 'Clásico').ok).toBe(true);
  });

  it('rechaza con motivo en español: vacía, demasiado corta y letra equivocada', () => {
    expect(precheckAnswer('   ', 'M')).toEqual({ ok: false, status: 'empty', reason: 'No respondiste.' });
    expect(precheckAnswer('M', 'M')).toEqual({ ok: false, status: 'invalid', reason: 'La respuesta es demasiado corta.' });
    expect(precheckAnswer('Ronaldo', 'M')).toEqual({ ok: false, status: 'invalid', reason: 'No empieza con la letra M.' });
  });

  it('compara respuestas sin importar tildes, mayúsculas ni artículos', () => {
    expect(compareKey('Lionel Messi')).toBe(compareKey('LIONEL MESSI'));
    expect(compareKey('La Bombonera')).toBe(compareKey('bombonera'));
  });
});
