import {
  Controller,
  Get,
  NotFoundException,
  Put,
  Param,
  ParseUUIDPipe,
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
    return this.usersService.findOwn(req.user.userId)
  }

  @Put('me')
  updateMe(@Request() req, @Body() body: UpdateProfileDto) {
    return this.usersService.update(req.user.userId, body)
  }

  // Listado público: sin email, fecha de nacimiento ni nombre real
  @Get()
  findAll() {
    return this.usersService.findAll()
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Usuario no encontrado') })) id: string) {
    return this.usersService.findPublic(id)
  }

  // No hay PUT ni DELETE /users/:id a propósito: cualquier usuario logueado podía editar o
  // borrar la cuenta de otro. Cada uno modifica sólo la suya con PUT /users/me.
}