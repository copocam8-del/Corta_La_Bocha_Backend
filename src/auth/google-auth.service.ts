import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

// Login con Google (Google Identity Services). El frontend manda el "ID token" (credential)
// que le da Google; acá lo verificamos y entramos con un usuario nuestro.
// Si GOOGLE_CLIENT_ID no está definido, este login queda desactivado y nada más se rompe.
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly clientId: string | undefined;
  private readonly client: OAuth2Client | null;

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    private auth: AuthService,
  ) {
    this.clientId = config.get<string>('GOOGLE_CLIENT_ID') || undefined;
    this.client = this.clientId ? new OAuth2Client(this.clientId) : null;
  }

  async login(credential: string) {
    if (!this.client || !this.clientId) {
      throw new ServiceUnavailableException('El inicio de sesión con Google no está disponible');
    }

    const google = await this.verify(credential);
    const user = await this.findOrCreateUser(google);
    return this.auth.issueSession(user);
  }

  // Verifica firma, vencimiento y que el token sea para NUESTRA app (audience)
  private async verify(credential: string): Promise<TokenPayload> {
    try {
      const ticket = await this.client!.verifyIdToken({ idToken: credential, audience: this.clientId });
      const payload = ticket.getPayload();
      if (!payload?.sub) throw new Error('Token sin "sub"');
      return payload;
    } catch (e) {
      this.logger.warn(`Token de Google inválido: ${(e as Error).message}`);
      throw new UnauthorizedException('No se pudo verificar tu cuenta de Google. Probá de nuevo.');
    }
  }

  private async findOrCreateUser(google: TokenPayload) {
    // 1) Ya entró antes con esta cuenta de Google
    const linked = await this.prisma.users.findUnique({ where: { google_id: google.sub } });
    if (linked) return linked;

    // 2) Sólo usamos el email si Google confirma que está verificado: si no, cualquiera podría
    //    crear una cuenta de Google con el email de otra persona y quedarse con su cuenta.
    const email = google.email?.trim().toLowerCase();
    if (!email || google.email_verified !== true) {
      throw new BadRequestException('Tu cuenta de Google no tiene un email verificado.');
    }

    const existing = await this.prisma.users.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existing) {
      if (existing.google_id && existing.google_id !== google.sub) {
        throw new ConflictException('Ese email ya está vinculado a otra cuenta de Google.');
      }
      // Unimos la cuenta existente (registrada con email y contraseña) con Google
      return this.prisma.users.update({ where: { id: existing.id }, data: { google_id: google.sub } });
    }

    // 3) Usuario nuevo. Google exige 13 años o más para tener cuenta, igual que nosotros.
    const username = await this.auth.generateUniqueUsername(google.given_name || email.split('@')[0]);
    try {
      return await this.prisma.users.create({
        data: {
          username,
          email,
          google_id: google.sub,
          first_name: google.given_name?.slice(0, 50),
          last_name: google.family_name?.slice(0, 50),
          password_hash: null, // sólo entra con Google (puede no tener contraseña)
          profile: { create: {} },
        },
      });
    } catch (e) {
      // Dos clics seguidos en el botón: el segundo encuentra la cuenta que creó el primero
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.users.findUnique({ where: { google_id: google.sub } });
        if (again) return again;
      }
      throw e;
    }
  }
}
