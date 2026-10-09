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
import { StatsService } from '../stats/stats.service'
import { AchievementsService } from '../achievements/achievements.service'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { authValidationPipe } from '../auth/auth-validation.pipe'

@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly statsService: StatsService,
    private readonly achievementsService: AchievementsService,
  ) {}

  // Perfil del usuario logueado (lee el id del token, no de la URL)
  @Get('me')
  getMe(@Request() req) {
    return this.usersService.findOwn(req.user.userId)
  }

  // Posición del usuario logueado en el ranking global
  @Get('me/ranking')
  getMyRanking(@Request() req) {
    return this.statsService.getUserRanking(req.user.userId)
  }

  // Todos los logros, con los desbloqueados por el usuario marcados
  @Get('me/achievements')
  getMyAchievements(@Request() req) {
    return this.achievementsService.listForUser(req.user.userId)
  }

  // Valida con el mismo pipe que /auth: errores 400 agrupados por campo y en español
  @Put('me')
  updateMe(@Request() req, @Body(authValidationPipe) body: UpdateProfileDto) {
    return this.usersService.update(req.user.userId, body)
  }

  // Ranking global: los 50 mejores (sólo datos públicos). Va antes de ':id' para que no lo tape.
  @Get('ranking')
  getRanking() {
    return this.statsService.getTopPlayers(50)
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
