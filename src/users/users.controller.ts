import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common'

import { AuthGuard } from '@nestjs/passport'
import { UsersService } from './users.service'
import { UpdateProfileDto } from './dto/update-profile.dto'

@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Perfil del usuario logueado (lee el id del token, no de la URL)
  @Get('me')
  getMe(@Request() req) {
    return this.usersService.findOne(req.user.userId)
  }

  @Put('me')
  updateMe(@Request() req, @Body() body: UpdateProfileDto) {
    return this.usersService.update(req.user.userId, body)
  }

  @Get()
  findAll() {
    return this.usersService.findAll()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdateProfileDto) {
    return this.usersService.update(id, body)
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.usersService.delete(id)
  }
} 