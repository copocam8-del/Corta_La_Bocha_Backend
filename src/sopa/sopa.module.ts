import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { SopaController } from './sopa.controller';
import { SopaService } from './sopa.service';

@Module({
  imports: [GamesModule],
  controllers: [SopaController],
  providers: [SopaService],
})
export class SopaModule {}
