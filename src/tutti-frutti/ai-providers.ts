import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import { FakeAiProvider } from './fake-ai-provider';

// Proveedores de IA para validar respuestas. Todos reciben lo mismo (instrucciones de sistema,
// las respuestas como JSON y el schema de salida) y devuelven el texto JSON de la respuesta,
// usando el modo de salida estructurada de cada uno. Se elige con AI_PROVIDER (por defecto
// "gemini") y el modelo se puede cambiar con AI_MODEL.

export type AiProviderName = 'gemini' | 'anthropic' | 'openai';

export const AI_PROVIDERS: Record<AiProviderName, { keyVar: string; defaultModel: string }> = {
  gemini: { keyVar: 'GEMINI_API_KEY', defaultModel: 'gemini-3.8-flash' },
  anthropic: { keyVar: 'ANTHROPIC_API_KEY', defaultModel: 'claude-haiku-5-5' },
  openai: { keyVar: 'OPENAI_API_KEY', defaultModel: 'gpt-4o-mini' },
};

export const DEFAULT_AI_PROVIDER: AiProviderName = 'gemini';

// Validar respuestas es una tarea simple: no hace falta que el modelo "piense". Con el razonamiento
// al mínimo cada llamada tarda bastante menos. También limitamos el largo de la respuesta: con
// 14 respuestas (jugador + máquina) el JSON ocupa unos 1000 tokens.
export const MAX_OUTPUT_TOKENS = 2048;

// Gemini 3 controla el razonamiento con thinkingLevel; Gemini 2.x con thinkingBudget (0 = apagado).
// Usamos LOW y no MINIMAL: gemini-3.8-flash rechaza MINIMAL con un 400 (medido el 12/10/2026).
export function geminiThinkingConfig(model: string): ThinkingConfig {
  return /^gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: ThinkingLevel.LOW };
}

// ¿Gemini rechazó el pedido por el nivel de razonamiento? (400 que menciona "thinking")
export function isThinkingConfigRejected(e: unknown): boolean {
  const err = e as { status?: number; message?: string };
  return err?.status === 400 && /thinking/i.test(err.message ?? '');
}

// Claude Haiku permite apagar el razonamiento con esfuerzo bajo. Opus 5.5 y Sonnet 5.5 rechazan
// thinking "disabled", así que en esos sólo se baja el esfuerzo.
export function anthropicThinkingOff(model: string): boolean {
  return model.includes('haiku');
}

// Los modelos de razonamiento de OpenAI (serie o y gpt-5) aceptan reasoning_effort; gpt-4o-mini no
// razona y rechaza ese parámetro.
export function openAiReasoningEffort(model: string): 'minimal' | null {
  return /^(o\d|gpt-5)/.test(model) ? 'minimal' : null;
}

export interface AiRequest {
  system: string; // instrucciones (nunca incluyen texto de los jugadores)
  userJson: string; // las respuestas de los jugadores, como datos JSON
  schemaName: string;
  schema: Record<string, unknown>; // JSON Schema con additionalProperties:false en todos los objetos
  timeoutMs: number;
}

export interface AiProvider {
  readonly name: AiProviderName | 'fake';
  readonly model: string;
  // Devuelve el JSON (como texto) que generó el modelo. Tira error si algo salió mal.
  completeJson(req: AiRequest): Promise<string>;
}

// ── OpenAI (Chat Completions con response_format json_schema strict) ─────────────────────────
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async completeJson(req: AiRequest): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(req.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        ...(openAiReasoningEffort(this.model) ? { reasoning_effort: openAiReasoningEffort(this.model) } : {}),
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.userJson },
        ],
        response_format: { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema: req.schema } },
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`OpenAI respondió ${response.status}: ${error.error?.message ?? response.statusText}`);
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
    const message = data.choices?.[0]?.message;
    if (!message?.content) throw new Error(`Respuesta vacía de OpenAI${message?.refusal ? `: ${message.refusal}` : ''}`);
    return message.content;
  }
}

// ── Anthropic (Claude API, SDK oficial, structured outputs con output_config.format) ─────────
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic' as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    // Sin reintentos del SDK: el validador ya reintenta una vez por su cuenta
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }

  async completeJson(req: AiRequest): Promise<string> {
    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: req.system,
        messages: [{ role: 'user', content: req.userJson }],
        // Clasificación simple: sin razonamiento (o el mínimo). El formato obliga a devolver JSON con el schema.
        ...(anthropicThinkingOff(this.model) ? { thinking: { type: 'disabled' as const } } : {}),
        output_config: { effort: 'low', format: { type: 'json_schema', schema: req.schema } },
      },
      { timeout: req.timeoutMs },
    );

    if (response.stop_reason === 'refusal') throw new Error('Claude rechazó el pedido');
    if (response.stop_reason === 'max_tokens') throw new Error('La respuesta de Claude quedó cortada');
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text' || !text.text) throw new Error('Respuesta vacía de Claude');
    return text.text;
  }
}

// ── Google Gemini (SDK oficial @google/genai, responseJsonSchema) ─────────────────────────────
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  // Se pone en true si el modelo rechaza nuestro thinkingConfig: desde ahí se manda sin él
  private thinkingUnsupported = false;

  async completeJson(req: AiRequest): Promise<string> {
    try {
      return await this.generate(req);
    } catch (e) {
      // Si el modelo no acepta el nivel de razonamiento (400), mejor validar con su razonamiento
      // por defecto que dejar toda la partida "sin validar"
      if (this.thinkingUnsupported || !isThinkingConfigRejected(e)) throw e;
      this.thinkingUnsupported = true;
      return this.generate(req);
    }
  }

  private async generate(req: AiRequest): Promise<string> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: req.userJson,
      config: {
        systemInstruction: req.system,
        temperature: 0,
        ...(this.thinkingUnsupported ? {} : { thinkingConfig: geminiThinkingConfig(this.model) }),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        responseJsonSchema: req.schema,
        httpOptions: { timeout: req.timeoutMs },
      },
    });
    const text = response.text;
    if (!text) throw new Error('Respuesta vacía de Gemini');
    return text;
  }
}

export interface ProviderConfig {
  provider?: string; // AI_PROVIDER
  model?: string; // AI_MODEL
  keys: Partial<Record<string, string>>; // GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY
  nodeEnv?: string; // NODE_ENV: con "production" no se permite AI_PROVIDER=fake
  fakeDelayMs?: number; // AI_FAKE_DELAY_MS: demora simulada del modo de prueba
}

export type ProviderResult =
  | { ok: true; provider: AiProvider }
  | { ok: false; name: AiProviderName; model: string; problem: string };

// Arma el proveedor según la configuración. Si falta la clave (o AI_PROVIDER es inválido) no tira
// error: el validador sigue funcionando y deja las respuestas "sin validar".
export function createAiProvider(config: ProviderConfig): ProviderResult {
  const requested = (config.provider || DEFAULT_AI_PROVIDER).trim().toLowerCase();
  // Modo de prueba (banco fijo, sin red): nunca en producción, ahí las respuestas tienen que
  // validarse de verdad
  if (requested === 'fake') {
    if (config.nodeEnv === 'production') {
      return { ok: false, name: DEFAULT_AI_PROVIDER, model: 'banco-fijo', problem: 'AI_PROVIDER="fake" no se permite en producción' };
    }
    return { ok: true, provider: new FakeAiProvider(config.fakeDelayMs) };
  }
  if (!(requested in AI_PROVIDERS)) {
    return {
      ok: false,
      name: DEFAULT_AI_PROVIDER,
      model: config.model || AI_PROVIDERS[DEFAULT_AI_PROVIDER].defaultModel,
      problem: `AI_PROVIDER="${config.provider}" no es válido (usá gemini, anthropic u openai)`,
    };
  }
  const name = requested as AiProviderName;
  const { keyVar, defaultModel } = AI_PROVIDERS[name];
  const model = config.model?.trim() || defaultModel;
  const apiKey = config.keys[keyVar]?.trim();
  if (!apiKey) return { ok: false, name, model, problem: `falta ${keyVar}` };

  const provider =
    name === 'anthropic'
      ? new AnthropicProvider(apiKey, model)
      : name === 'openai'
        ? new OpenAiProvider(apiKey, model)
        : new GeminiProvider(apiKey, model);
  return { ok: true, provider };
}
