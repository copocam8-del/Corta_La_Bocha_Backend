// Mide cuánto tarda validar una ronda completa con la IA configurada en el .env (AI_PROVIDER,
// AI_MODEL y la clave). NO usa la base de datos: sólo el validador.
//
//   npx ts-node -T scripts/medir-validacion.ts
//
// Cada corrida es un proceso nuevo, así que la caché en memoria no ayuda: mide el caso real.
// Nunca imprime la clave (si un error la incluyera, se reemplaza por [CLAVE OCULTA]).
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { TuttiFruttiValidatorService } from '../src/tutti-frutti/tutti-frutti.service';
import type { AiProvider } from '../src/tutti-frutti/ai-providers';
import { TEMATICAS } from '../src/solo-matches/solo-quick';
import { AI_ANSWER_BANK } from '../src/solo-matches/ai-answer-bank';

const LETRA = 'N';
const TEMATICA = 'liga_argentina';

// Respuestas "del jugador" (algunas válidas, algunas no, como en una partida real)
const JUGADOR: Record<string, string> = {
  'Jugador Arg': 'Nico González',
  'Equipo Arg': 'Newells',
  'DT Arg': 'Néstor Gorosito',
  Estadio: 'Nuevo Gasometro',
  'Apodo Club': 'Negros',
  'Jugador Histórico': 'Norberto Alonso',
  Clásico: 'Nacional Peñarol',
};

const claves = [process.env.GEMINI_API_KEY, process.env.ANTHROPIC_API_KEY, process.env.OPENAI_API_KEY]
  .map((k) => k?.trim())
  .filter((k): k is string => !!k);
const ocultar = (s: string) => claves.reduce((acc, k) => acc.split(k).join('[CLAVE OCULTA]'), s);

async function main() {
  const validador = new TuttiFruttiValidatorService(new ConfigService());
  console.log(`Proveedor: ${JSON.stringify(validador.providerInfo)} | letra ${LETRA} | temática ${TEMATICA}`);

  // Medimos cada intento contra la IA (para ver reintentos y cuánto tardó cada uno)
  const intentos: string[] = [];
  const ai = (validador as unknown as { ai: AiProvider | null }).ai;
  if (ai) {
    const original = ai.completeJson.bind(ai);
    ai.completeJson = async (req) => {
      const t = Date.now();
      try {
        const out = await original(req);
        intentos.push(`ok en ${((Date.now() - t) / 1000).toFixed(1)} s`);
        return out;
      } catch (e) {
        intentos.push(`FALLÓ en ${((Date.now() - t) / 1000).toFixed(1)} s (${ocultar(String((e as Error).message)).slice(0, 90)})`);
        throw e;
      }
    };
  }

  const categorias = TEMATICAS[TEMATICA];
  const items = [
    ...categorias.map((c) => ({ key: `jugador | ${c}`, category: c, answer: JUGADOR[c] ?? null })),
    ...categorias.map((c) => ({ key: `máquina | ${c}`, category: c, answer: AI_ANSWER_BANK[c]?.[LETRA]?.[0] ?? null })),
  ];

  const inicio = Date.now();
  const res = await validador.validateAnswers(LETRA, items);
  const total = (Date.now() - inicio) / 1000;

  console.log(`TOTAL: ${total.toFixed(1)} s | intentos: ${intentos.join(' → ') || 'ninguno (todo resuelto en código)'}`);
  for (const [k, r] of res) {
    const answer = items.find((i) => i.key === k)?.answer ?? '—';
    console.log(ocultar(`  ${k.padEnd(30)} "${answer}" → ${r.status}${r.canonical ? ` (${r.canonical})` : ''}`));
  }
}

main().catch((e) => {
  console.error('ERROR:', ocultar(String((e as Error)?.message ?? e)));
  process.exit(1);
});
