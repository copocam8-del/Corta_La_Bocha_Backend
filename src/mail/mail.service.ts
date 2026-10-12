import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Envío de emails con un proveedor configurable por variables de entorno:
//   MAIL_PROVIDER=resend → RESEND_API_KEY (API HTTP de Resend)
//   MAIL_PROVIDER=smtp   → SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE (con nodemailer)
//   MAIL_FROM            → remitente, ej. "Corta La Bocha <no-responder@tudominio.com>"
// Sin configuración, no manda nada y lo avisa en el log (la app sigue funcionando).

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

  get provider(): 'resend' | 'smtp' | null {
    const p = (this.config.get<string>('MAIL_PROVIDER') ?? '').trim().toLowerCase();
    if (p === 'resend' && this.config.get<string>('RESEND_API_KEY')) return 'resend';
    if (p === 'smtp' && this.config.get<string>('SMTP_HOST')) return 'smtp';
    return null;
  }

  // Devuelve true si se mandó. Nunca tira error hacia afuera (el que llama responde igual).
  async send(mail: Mail): Promise<boolean> {
    const provider = this.provider;
    if (!provider) {
      this.logger.warn('El email no está configurado (MAIL_PROVIDER): no se mandó el mail.');
      return false;
    }
    const from = this.config.get<string>('MAIL_FROM') || 'Corta La Bocha <no-responder@example.com>';
    try {
      if (provider === 'resend') {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.config.get<string>('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
        });
        if (!res.ok) throw new Error(`Resend respondió ${res.status}`);
      } else {
        await this.transport().sendMail({ from, ...mail });
      }
      return true;
    } catch (e) {
      // No se loguea el destinatario completo ni datos de la cuenta
      this.logger.error(`No se pudo mandar el mail (${provider}): ${(e as Error).message}`);
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
