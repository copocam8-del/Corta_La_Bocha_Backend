import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

// "¿Olvidaste tu contraseña?":
//   1. POST /auth/forgot-password {email} → si existe la cuenta, se crea un token de un solo uso que vence en
//      1 hora y se manda el link por mail. La respuesta es SIEMPRE la misma (no revela quién tiene cuenta).
//   2. POST /auth/reset-password {token, password} → si el token es válido, se cambia la contraseña.
// En la base se guarda sólo el hash SHA-256 del token: si alguien lee la base no puede usar los links.

export const RESET_TTL_MS = 60 * 60 * 1000;
export const FORGOT_MESSAGE = 'Si el email está registrado, te mandamos un link para elegir una contraseña nueva. Revisá tu correo (y el spam).';
export const INVALID_TOKEN_MESSAGE = 'El link no es válido o ya venció. Pedí uno nuevo.';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('RecuperarContraseña');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async forgot(email: string, now = Date.now()) {
    const user = await this.prisma.users.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, username: true, email: true },
    });
    if (user?.email) {
      // El trabajo pesado (crear el token y mandar el mail) no se espera: así la respuesta tarda lo
      // mismo exista o no la cuenta
      void this.crearYEnviar(user as { id: string; username: string; email: string }, now).catch((e) =>
        this.logger.error(`Falló el pedido de recuperación: ${(e as Error).message}`),
      );
    }
    return { message: FORGOT_MESSAGE };
  }

  async reset(token: string, password: string, now = Date.now()) {
    const fila = await this.prisma.password_resets.findUnique({ where: { token_hash: hashToken(token ?? '') } });
    if (!fila || fila.used_at || fila.expires_at.getTime() < now) throw new BadRequestException(INVALID_TOKEN_MESSAGE);

    const hashed = await bcrypt.hash(password, 10);
    await this.prisma.$transaction(async (tx) => {
      // Se marca usado sólo si nadie lo usó en el medio (un solo uso aunque lleguen dos pedidos juntos)
      const claimed = await tx.password_resets.updateMany({
        where: { id: fila.id, used_at: null },
        data: { used_at: new Date(now) },
      });
      if (claimed.count === 0) throw new BadRequestException(INVALID_TOKEN_MESSAGE);
      await tx.users.update({ where: { id: fila.user_id }, data: { password_hash: hashed } });
      // Los demás links pendientes de esa cuenta dejan de servir
      await tx.password_resets.updateMany({ where: { user_id: fila.user_id, used_at: null }, data: { used_at: new Date(now) } });
    });
    return { message: 'Listo, ya cambiaste tu contraseña. Ahora podés iniciar sesión.' };
  }

  private async crearYEnviar(user: { id: string; username: string; email: string }, now: number) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      // Un pedido nuevo anula los anteriores
      this.prisma.password_resets.updateMany({ where: { user_id: user.id, used_at: null }, data: { used_at: new Date(now) } }),
      this.prisma.password_resets.create({
        data: { user_id: user.id, token_hash: hashToken(token), expires_at: new Date(now + RESET_TTL_MS), created_at: new Date(now) },
      }),
    ]);

    const base = (this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173').replace(/\/$/, '');
    const link = `${base}/restablecer-contrasena?token=${token}`;
    const enviado = await this.mail.send({
      to: user.email,
      subject: 'Elegí una contraseña nueva · Corta La Bocha',
      text: `Hola ${user.username}:\n\nPara elegir una contraseña nueva entrá a este link (vence en 1 hora y sirve una sola vez):\n${link}\n\nSi no lo pediste vos, ignorá este mail: tu contraseña sigue igual.`,
      html: `<p>Hola ${escapeHtml(user.username)}:</p><p>Para elegir una contraseña nueva hacé clic acá (vence en 1 hora y sirve una sola vez):</p><p><a href="${link}">Elegir contraseña nueva</a></p><p>Si no lo pediste vos, ignorá este mail: tu contraseña sigue igual.</p>`,
    });
    // Fuera de producción, el link se muestra en la consola para poder probar sin mandar mails
    if (!enviado && this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.log(`[sólo para probar] Link para elegir contraseña nueva: ${link}`);
    }
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
