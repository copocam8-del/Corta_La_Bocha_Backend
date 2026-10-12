import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { MultiplayerService } from './multiplayer.service';
import { StatsModule } from '../stats/stats.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { TuttiFruttiModule } from '../tutti-frutti/tutti-frutti.module';
import { getJwtConfig } from '../auth/jwt.config';

@Module({
  imports: [
    StatsModule,
    AchievementsModule,
    TuttiFruttiModule,
    // Para verificar el token de las conexiones de Socket.IO (mismo secreto que el login)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: getJwtConfig(config).secret }),
    }),
  ],
  controllers: [RoomsController],
  providers: [RoomsService, MultiplayerService, RoomsGateway],
})
export class RoomsModule {}
