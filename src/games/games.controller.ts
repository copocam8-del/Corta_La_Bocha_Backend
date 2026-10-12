import { Controller, Get } from '@nestjs/common';
import { GAMES } from './games';

@Controller('games')
export class GamesController {
  // Catálogo para la pantalla de selección (público: no tiene datos de nadie)
  @Get()
  list() {
    return GAMES.map(({ id, name, description, available, path, multiplayer, hasElo }) => ({ id, name, description, available, path, multiplayer, hasElo }));
  }
}
