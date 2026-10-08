import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';

import { StatsModule } from '../stats/stats.module';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [StatsModule, AchievementsModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomsGateway],
})
export class RoomsModule {} 