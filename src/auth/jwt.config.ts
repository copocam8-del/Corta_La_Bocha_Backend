import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Único lugar donde se lee la configuración del JWT.
// La usan auth.module.ts (para firmar tokens) y jwt.strategy.ts (para verificarlos),
// así nunca pueden quedar con secretos distintos.

const DEV_FALLBACK_SECRET = 'dev_only_insecure_jwt_secret';
const DEFAULT_EXPIRATION = '7d';

export interface JwtConfig {
  secret: string;
  expiresIn: string;
}

let warned = false;

export function getJwtConfig(config: ConfigService): JwtConfig {
  const secret = config.get<string>('JWT_SECRET');
  const expiresIn = config.get<string>('JWT_EXPIRATION') || DEFAULT_EXPIRATION;

  if (secret) return { secret, expiresIn };

  if (config.get<string>('NODE_ENV') === 'production') {
    // En producción preferimos que el servidor no arranque antes que firmar tokens con un secreto conocido
    throw new Error('JWT_SECRET no está definido. Es obligatorio en producción.');
  }

  if (!warned) {
    new Logger('JwtConfig').warn('JWT_SECRET no definido: usando un secreto de desarrollo. No usar en producción.');
    warned = true;
  }
  return { secret: DEV_FALLBACK_SECRET, expiresIn };
}
