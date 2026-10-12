import { AI_ANSWER_BANK } from '../solo-matches/ai-answer-bank';
import { normalizeText } from './answer-rules';
import type { AiProvider, AiRequest } from './ai-providers';

// Proveedor "de mentira" para probar partidas completas sin gastar cuota de la IA real.
// Se activa con AI_PROVIDER=fake y SÓLO fuera de producción (en producción se rechaza).
// Valida con un banco fijo: el banco de la máquina (todas las letras) + FAKE_EXTRA_ANSWERS.
// Una respuesta vale si coincide con un nombre del banco de esa categoría (sin tildes ni mayúsculas),
// o si coincide su apellido ("Lionel Messi" vale porque el banco tiene "Messi").

// Respuestas extra que valen en el modo de prueba (para escribir a mano en las pruebas)
export const FAKE_EXTRA_ANSWERS: Record<string, string[]> = {
  Jugador: ['Lionel Messi', 'Nico González'],
  'Jugador Arg': ['Nico González'],
  'DT Arg': ['Néstor Gorosito'],
};

const lastWord = (s: string) => s.split(' ').pop() ?? s;

function knownAnswers(category: string): string[] {
  const byLetter = AI_ANSWER_BANK[category] ?? {};
  return [...Object.values(byLetter).flat(), ...(FAKE_EXTRA_ANSWERS[category] ?? [])];
}

// Busca la respuesta en el banco. Devuelve el nombre del banco (canónico) o null.
export function fakeLookup(category: string, answer: string): string | null {
  const wanted = normalizeText(answer);
  if (!wanted) return null;
  const options = knownAnswers(category);
  const exact = options.find((o) => normalizeText(o) === wanted);
  if (exact) return exact;
  // Apellido: sólo si tiene al menos 4 letras (para que "De" o "Di" no coincidan con cualquiera)
  const surname = lastWord(wanted);
  if (surname.length < 4) return null;
  return options.find((o) => lastWord(normalizeText(o)) === surname) ?? null;
}

export class FakeAiProvider implements AiProvider {
  readonly name = 'fake' as const;
  readonly model = 'banco-fijo';

  constructor(private readonly delayMs = 300) {}

  async completeJson(req: AiRequest): Promise<string> {
    const payload = JSON.parse(req.userJson) as {
      respuestas: { id: string; categoria: string; respuesta: string }[];
    };
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    const results = payload.respuestas.map((r) => {
      const found = fakeLookup(r.categoria, r.respuesta);
      return {
        id: r.id,
        isValid: found !== null,
        canonical: found ?? '',
        reason: found ? 'Válida (modo de prueba).' : 'No está en el banco del modo de prueba.',
      };
    });
    return JSON.stringify({ results });
  }
}
