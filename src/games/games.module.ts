import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GameResultsService } from './game-results.service';
import { ContenidoVistoService } from './contenido-visto.service';
import { StatsModule } from '../stats/stats.module';
import { AchievementsModule } from '../achievements/achievements.module';

// Base común de los juegos: catálogo y registro de resultados. Cada juego importa este módulo.
@Module({
  imports: [StatsModule, AchievementsModule],
  controllers: [GamesController],
  providers: [GameResultsService, ContenidoVistoService],
  exports: [GameResultsService, ContenidoVistoService],
})
export class GamesModule {}
