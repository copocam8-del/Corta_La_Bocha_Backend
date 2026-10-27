import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { getJwtConfig } from './jwt.config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtConfig(configService).secret,
    });
  }

  // Un token firmado no alcanza: el usuario tiene que seguir existiendo. Si borró su cuenta (DELETE /users/me),
  // su token deja de servir en todos lados (401, nunca 500 por buscar algo que ya no está).
  async validate(payload: any) {
    const id = typeof payload?.sub === 'string' ? payload.sub : '';
    const user = /^[0-9a-f-]{36}$/i.test(id)
      ? await this.prisma.users.findUnique({ where: { id }, select: { id: true } })
      : null;
    if (!user) throw new UnauthorizedException();
    return { userId: payload.sub, email: payload.email };
  }
}
