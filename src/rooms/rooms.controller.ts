import { Controller, Post, Get, Body, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RoomsService } from './rooms.service';
import { MultiplayerService } from './multiplayer.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { authValidationPipe } from '../auth/auth-validation.pipe';

// Por HTTP sólo se crea la sala y se consulta si existe. Todo el juego (entrar, configurar,
// arrancar, responder, ¡Basta!) va por Socket.IO (rooms.gateway.ts), donde manda el servidor.
@UseGuards(AuthGuard('jwt'))
@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly multiplayer: MultiplayerService,
  ) {}

  // Crea una sala privada con código; quien la crea es el anfitrión
  @Post()
  async create(@Body(authValidationPipe) dto: CreateRoomDto, @Request() req) {
    const { game = 'tutti_frutti', ...settings } = dto;
    const res = await this.multiplayer.engine.createPrivateRoom(req.user.userId, settings, game);
    if (!res.ok) throw new BadRequestException(res.error);
    return { code: res.code };
  }

  // Para "Unirse con código": si la sala existe y en qué estado está
  @Get(':code')
  findOne(@Param('code') code: string) {
    return this.roomsService.summary(code);
  }
}
