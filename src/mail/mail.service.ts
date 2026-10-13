import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Envío de emails con un proveedor configurable por variables de entorno:
//   MAIL_PROVIDER=brevo  → BREVO_API_KEY (API HTTP de Brevo; sirve en Render gratis, que bloquea SMTP)
//   MAIL_PROVIDER=resend → RESEND_API_KEY (API HTTP de Resend)
//   MAIL_PROVIDER=smtp   → SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE (con nodemailer)
//   MAIL_FROM            → remitente, ej. "Corta La Bocha <no-responder@tudominio.com>"
// Sin configuración, no manda nada y lo avisa en el log (la app sigue funcionando).
// Nunca se imprime una clave ni el contenido del mail en el log.

export const MAIL_TIMEOUT_MS = 10_000;
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

// "Corta La Bocha <no-responder@x.com>" → { name: 'Corta La Bocha', email: 'no-responder@x.com' }.
// Si viene sólo el mail, el nombre es "Corta La Bocha".
export function separarRemitente(from: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<\s*([^<>\s]+)\s*>\s*$/.exec(from);
  if (m) return { name: m[1].trim() || 'Corta La Bocha', email: m[2] };
  return { name: 'Corta La Bocha', email: from.trim() };
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Lo mínimo que usamos de nodemailer (no trae tipos propios)
interface SmtpTransport {
  sendMail(m: { from: string; to: string; subject: string; text: string; html: string }): Promise<unknown>;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private smtp: SmtpTransport | null = null;

  constructor(private readonly config: ConfigService) {}

  get provider(): 'brevo' | 'resend' | 'smtp' | null {
    const p = (this.config.get<string>('MAIL_PROVIDER') ?? '').trim().toLowerCase();
    if (p === 'brevo' && this.config.get<string>('BREVO_API_KEY')) return 'brevo';
    if (p === 'resend' && this.config.get<string>('RESEND_API_KEY')) return 'resend';
    if (p === 'smtp' && this.config.get<string>('SMTP_HOST')) return 'smtp';
    return null;
  }

  // Devuelve true si se mandó. Nunca tira error hacia afuera (el que llama responde igual).
  async send(mail: Mail): Promise<boolean> {
    const provider = this.provider;
    if (!provider) {
      const elegido = (this.config.get<string>('MAIL_PROVIDER') ?? '').trim().toLowerCase();
      this.logger.warn(
        elegido === 'brevo'
          ? 'MAIL_PROVIDER=brevo pero falta BREVO_API_KEY: no se mandó el mail.'
          : 'El email no está configurado (MAIL_PROVIDER): no se mandó el mail.',
      );
      return false;
    }
    const from = this.config.get<string>('MAIL_FROM') || 'Corta La Bocha <no-responder@example.com>';
    try {
      if (provider === 'brevo') {
        const res = await fetch(BREVO_URL, {
          method: 'POST',
          headers: {
            'api-key': this.config.get<string>('BREVO_API_KEY')!,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            sender: separarRemitente(from),
            to: [{ email: mail.to }],
            subject: mail.subject,
            htmlContent: mail.html,
            textContent: mail.text,
          }),
          signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
        });
        if (!res.ok) {
          // Sólo el estado y el código de error de Brevo (su mensaje puede incluir mails)
          const codigo = await res.json().then((b: { code?: unknown }) => (typeof b?.code === 'string' ? b.code : '')).catch(() => '');
          throw new Error(`Brevo respondió ${res.status}${codigo ? ` (${codigo})` : ''}`);
        }
      } else if (provider === 'resend') {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.config.get<string>('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
          signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`Resend respondió ${res.status}`);
      } else {
        await this.transport().sendMail({ from, ...mail });
      }
      return true;
    } catch (e) {
      // No se loguea el destinatario completo ni datos de la cuenta
      const err = e as Error;
      const motivo = err.name === 'TimeoutError' || err.name === 'AbortError' ? `no respondió en ${MAIL_TIMEOUT_MS / 1000} s` : err.message;
      this.logger.error(`No se pudo mandar el mail (${provider}): ${motivo}`);
      return false;
    }
  }

  private transport(): SmtpTransport {
    if (!this.smtp) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodemailer = require('nodemailer') as { createTransport(o: object): SmtpTransport };
      const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
      this.smtp = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST'),
        port,
        secure: (this.config.get<string>('SMTP_SECURE') ?? (port === 465 ? 'true' : 'false')) === 'true',
        auth: this.config.get<string>('SMTP_USER')
          ? { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASS') }
          : undefined,
      });
    }
    return this.smtp;
  }
}
