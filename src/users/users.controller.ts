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
  Query,
  BadRequestException,
  Post,
  HttpCode,
} from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'

import { AuthGuard } from '@nestjs/passport'
import { UsersService } from './users.service'
import { StatsService } from '../stats/stats.service'
import { AchievementsService } from '../achievements/achievements.service'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { AceptarTerminosDto } from './dto/aceptar-terminos.dto'
import { authValidationPipe } from '../auth/auth-validation.pipe'
import { PERIODS, type Period } from '../stats/periods'
import { isGameId, type GameId } from '../games/games'

function parsePeriod(period?: string): Period {
  if (!period) return 'global'
  if (!(PERIODS as readonly string[]).includes(period)) {
    throw new BadRequestException('Período inválido (global, semanal, mensual o elo)')
  }
  return period as Period
}

function parseGame(game?: string): GameId | undefined {
  if (!game) return undefined
  if (!isGameId(game)) throw new BadRequestException('Juego inválido')
  return game
}

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

  // Posición del usuario logueado (aunque no esté en el top). ?period=global|semanal|mensual|elo
  // y opcional ?game=<juego> (ranking de ese juego)
  @Get('me/ranking')
  getMyRanking(@Request() req, @Query('period') period?: string, @Query('game') game?: string) {
    return this.statsService.getUserRanking(req.user.userId, parsePeriod(period), parseGame(game))
  }

  // Estadísticas del usuario en cada juego
  @Get('me/games')
  getMyGames(@Request() req) {
    return this.statsService.getGameStats(req.user.userId)
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

  // Aceptar los Términos y la Política de privacidad (la versión vigente). Sólo el usuario del token: no hay forma de
  // aceptar por otro. Máximo 10 por minuto por IP, como el login.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @Post('me/aceptar-terminos')
  aceptarTerminos(@Request() req, @Body(authValidationPipe) body: AceptarTerminosDto) {
    return this.usersService.aceptarTerminos(req.user.userId, body.version)
  }

  // Ranking: los 50 mejores (sólo datos públicos). Va antes de ':id' para que no lo tape.
  // ?period=global (puntos totales, por defecto) | semanal | mensual (partidas del período) | elo
  @Get('ranking')
  getRanking(@Query('period') period?: string, @Query('game') game?: string) {
    return this.statsService.getLeaderboard(parsePeriod(period), 50, parseGame(game))
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
