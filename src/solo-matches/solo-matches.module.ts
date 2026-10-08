import { Module } from '@nestjs/common';
import { SoloMatchesController } from './solo-matches.controller';
import { SoloMatchesService } from './solo-matches.service';
import { TuttiFruttiModule } from '../tutti-frutti/tutti-frutti.module';
import { StatsModule } from '../stats/stats.module';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [TuttiFruttiModule, StatsModule, AchievementsModule],
  controllers: [SoloMatchesController],
  providers: [SoloMatchesService],
})
export class SoloMatchesModule {} 