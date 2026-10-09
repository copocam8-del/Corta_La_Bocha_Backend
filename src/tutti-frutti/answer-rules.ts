// Reglas que se chequean EN CÓDIGO antes de llamar a la IA (gratis, rápido y sin margen de error):
// que haya respuesta, que tenga un largo mínimo y que empiece con la letra de la ronda.

export const MIN_ANSWER_LETTERS = 2;

// Artículos y "Club" al principio: la respuesta vale con la letra de la palabra siguiente
// ("La Bombonera" vale para la B) y TAMBIÉN con la del artículo, porque hay apellidos que
// empiezan así ("La Volpe" vale para la L). "lo" no se ignora: "Lo Celso" es un apellido.
const ARTICLES = ['el', 'la', 'los', 'las', 'club'];
// Palabras propias de una categoría que NUNCA cuentan para la letra: si no, cualquier estadio
// valdría para la E ("Estadio Azteca") y cualquier clásico para la C.
const IGNORED_BY_CATEGORY: Record<string, string[]> = {
  Estadio: ['estadio'], // "Estadio Monumental" empieza con M
  Clásico: ['clasico', 'derbi', 'derby', 'de', 'del'], // "Clásico de Avellaneda" empieza con A
};

// minúsculas, sin acentos, sin signos y con espacios simples: "  Di  María! " → "di maria"
export function normalizeText(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

function stripWords(normalized: string, ignoredWords: string[]): string {
  const ignored = new Set(ignoredWords);
  const words = normalized.split(' ').filter(Boolean);
  while (words.length > 1 && ignored.has(words[0])) words.shift();
  return words.join(' ');
}

// Saca las palabras iniciales que no cuentan (artículos y las de la categoría). Nunca deja la respuesta vacía.
export function stripIgnoredPrefixes(normalized: string, category?: string): string {
  return stripWords(normalized, [...ARTICLES, ...((category && IGNORED_BY_CATEGORY[category]) || [])]);
}

export type PrecheckResult =
  | { ok: true; normalized: string }
  | { ok: false; status: 'empty' | 'invalid'; reason: string };

export function precheckAnswer(answer: string | null | undefined, letter: string, category?: string): PrecheckResult {
  const normalized = normalizeText(answer);
  if (!normalized) return { ok: false, status: 'empty', reason: 'No respondiste.' };

  const core = stripIgnoredPrefixes(normalized, category);
  const letters = core.replace(/[^a-zñ]/g, '');
  if (letters.length < MIN_ANSWER_LETTERS) {
    return { ok: false, status: 'invalid', reason: 'La respuesta es demasiado corta.' };
  }

  // Con o sin artículo, pero siempre sin las palabras propias de la categoría
  const withArticle = stripWords(normalized, (category && IGNORED_BY_CATEGORY[category]) || []);
  const target = normalizeText(letter);
  if (core[0] !== target && withArticle[0] !== target) {
    return { ok: false, status: 'invalid', reason: `No empieza con la letra ${letter.toUpperCase()}.` };
  }

  return { ok: true, normalized };
}

// Clave para comparar dos respuestas entre jugadores ("Lionel Messi" y "lionel messi" son la misma)
export const compareKey = (text: string | null | undefined, category?: string) =>
  stripIgnoredPrefixes(normalizeText(text), category);
