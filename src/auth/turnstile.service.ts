import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Captcha de Cloudflare Turnstile en el registro (frena bots que crean cuentas en masa).
// El frontend muestra el widget (invisible) y manda el token en `captchaToken`; acá se lo verifica con Cloudflare.
// Si TURNSTILE_SECRET_KEY no está definida, se saltea la verificación y se avisa en el log al arrancar.
// Nunca se loguean ni el token ni la clave.
export const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_TIMEOUT_MS = 8_000;
export const CAPTCHA_MESSAGE = 'No pudimos verificar que seas una persona. Recargá la página y probá de nuevo.';

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger('Captcha');
  private readonly secret: string | undefined;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('TURNSTILE_SECRET_KEY') || undefined;
    if (!this.secret) {
      this.logger.warn('TURNSTILE_SECRET_KEY no definida: el registro funciona SIN captcha.');
    }
  }

  get enabled() {
    return !!this.secret;
  }

  // Sin captcha configurado no hace nada. Con captcha: 400 si falta o es inválido, 503 si Cloudflare no responde
  async verify(token: string | undefined, ip?: string) {
    if (!this.secret) return;
    if (!token) throw captchaError();

    let data: { success?: boolean; 'error-codes'?: string[] };
    try {
      const body = new URLSearchParams({ secret: this.secret, response: token });
      if (ip) body.set('remoteip', ip);
      const res = await fetch(TURNSTILE_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Turnstile respondió ${res.status}`);
      data = (await res.json()) as typeof data;
    } catch (e) {
      // Se corta el registro (no lo dejamos pasar sin verificar), pero es culpa nuestra/de Cloudflare: 503
      this.logger.error(`No se pudo verificar el captcha: ${(e as Error).name === 'TimeoutError' ? 'timeout' : (e as Error).message}`);
      throw new ServiceUnavailableException('No pudimos verificar el captcha. Probá de nuevo en un rato.');
    }

    if (data.success !== true) {
      this.logger.warn(`Captcha rechazado: ${(data['error-codes'] ?? []).join(', ') || 'sin detalle'}`);
      throw captchaError();
    }
  }
}

// Mismo formato que los errores de validación de /auth, para que el frontend lo muestre igual
const captchaError = () =>
  new BadRequestException({ statusCode: 400, message: 'Datos inválidos', errors: { captchaToken: [CAPTCHA_MESSAGE] } });
