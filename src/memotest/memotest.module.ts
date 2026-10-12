import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { MemotestController } from './memotest.controller';
import { MemotestService } from './memotest.service';

@Module({
  imports: [GamesModule],
  controllers: [MemotestController],
  providers: [MemotestService],
})
export class MemotestModule {}
