import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { AhorcadoController } from './ahorcado.controller';
import { AhorcadoService } from './ahorcado.service';

@Module({
  imports: [GamesModule],
  controllers: [AhorcadoController],
  providers: [AhorcadoService],
})
export class AhorcadoModule {}
