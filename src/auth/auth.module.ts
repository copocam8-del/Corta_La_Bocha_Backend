import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { getJwtConfig } from './jwt.config';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    // Límite de intentos para /auth (ver @Throttle en auth.controller.ts). Se guarda en memoria:
    // alcanza con una sola instancia en Render; con varias habría que usar Redis.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 10 }],
      errorMessage: 'Demasiados intentos. Esperá un minuto y probá de nuevo.',
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { secret, expiresIn } = getJwtConfig(config);
        return { secret, signOptions: { expiresIn: expiresIn as JwtSignOptions['expiresIn'] } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
