import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { TriviaController } from './trivia.controller';
import { TriviaService } from './trivia.service';

@Module({
  imports: [GamesModule],
  controllers: [TriviaController],
  providers: [TriviaService],
})
export class TriviaModule {}
