import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { DesafioController } from './desafio.controller';
import { DesafioService } from './desafio.service';

@Module({
  imports: [GamesModule],
  controllers: [DesafioController],
  providers: [DesafioService],
})
export class DesafioModule {}
