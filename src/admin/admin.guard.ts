import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { isAdminEmail, parseAdminEmails } from './admin-access';

// Va DESPUÉS de AuthGuard('jwt') (sin sesión → 401). Logueado pero no admin → 404 con el mismo
// mensaje que una ruta que no existe, para no revelar que el panel existe. El email se busca en la
// base (no se confía en el del token, que puede ser viejo).
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.userId;
    if (!userId) throw new UnauthorizedException();
    const noExiste = new NotFoundException(`Cannot ${req.method} ${req.originalUrl ?? req.url}`);
    const admins = parseAdminEmails(this.config.get<string>('ADMIN_EMAILS'));
    if (admins.size === 0) throw noExiste;
    const user = await this.prisma.users.findUnique({ where: { id: userId }, select: { email: true } });
    if (!isAdminEmail(user?.email, admins)) throw noExiste;
    return true;
  }
}
