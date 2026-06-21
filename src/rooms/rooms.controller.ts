import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { CreateRoomDto } from './dto/create-room.dto';
import { StartMatchDto } from './dto/start-match.dto';

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomsGateway: RoomsGateway,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Body() dto: CreateRoomDto, @Request() req) {
    return this.roomsService.create(dto, req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':code/join')
  async join(@Param('code') code: string, @Request() req) {
    const room = await this.roomsService.joinByCode(code, req.user.userId);
    this.roomsGateway.emitToRoom(code.toUpperCase(), 'player_joined_http', {
      userId: req.user.userId,
    });
    return room;
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':code/start')
  async startMatch(@Param('code') code: string, @Body() dto: StartMatchDto, @Request() req) {
    const result = await this.roomsService.startMatch(code, req.user.userId, dto);
    this.roomsGateway.emitToRoom(code.toUpperCase(), 'round_started', {
      matchId: result.match.id,
      round: result.round,
      categoryIds: result.categoryIds,
      roundSeconds: result.roundSeconds,
    });
    return result;
  }

  @Get(':code')
  findOne(@Param('code') code: string) {
    return this.roomsService.findByCode(code);
  }

  @Get()
  findPublic() {
    return this.roomsService.findPublicRooms();
  }
} 