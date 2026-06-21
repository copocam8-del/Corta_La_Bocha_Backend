import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Body() dto: CreateRoomDto, @Request() req) {
    return this.roomsService.create(dto, req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':code/join')
  join(@Param('code') code: string, @Request() req) {
    return this.roomsService.joinByCode(code, req.user.userId);
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