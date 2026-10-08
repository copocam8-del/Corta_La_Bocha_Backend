import { Module } from '@nestjs/common';
import { SoloMatchesController } from './solo-matches.controller';
import { SoloMatchesService } from './solo-matches.service';
import { TuttiFruttiModule } from '../tutti-frutti/tutti-frutti.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [TuttiFruttiModule, StatsModule],
  controllers: [SoloMatchesController],
  providers: [SoloMatchesService],
})
export class SoloMatchesModule {} 