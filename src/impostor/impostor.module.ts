import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { ImpostorController } from './impostor.controller';
import { ImpostorService } from './impostor.service';

@Module({
  imports: [GamesModule],
  controllers: [ImpostorController],
  providers: [ImpostorService],
})
export class ImpostorModule {}
