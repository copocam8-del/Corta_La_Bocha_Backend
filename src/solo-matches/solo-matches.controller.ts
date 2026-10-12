import { Controller, Post, Body, Param, UseGuards, Request, ParseUUIDPipe, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SoloMatchesService } from './solo-matches.service';
import { FinishQuickMatchDto, StartQuickMatchDto } from './dto/quick-match.dto';
import { authValidationPipe } from '../auth/auth-validation.pipe';

// Sólo existe la partida rápida. La API anterior por rondas (POST /solo-matches, .../answers,
// .../validate) se borró: no controlaba de quién era la partida y dejaba llamar a la IA sin límite.
@UseGuards(AuthGuard('jwt'))
@Controller('solo-matches')
export class SoloMatchesController {
  constructor(private readonly soloMatchesService: SoloMatchesService) {}

  // Partida rápida contra la máquina: el servidor sortea la letra y arma el plan de la IA
  @Post('quick')
  startQuick(@Body(authValidationPipe) dto: StartQuickMatchDto, @Request() req) {
    return this.soloMatchesService.startQuickMatch(req.user.userId, dto);
  }

  // Termina la partida rápida: valida las respuestas, calcula el resultado y suma estadísticas
  @Post('quick/:matchId/finish')
  finishQuick(
    @Param('matchId', new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Partida no encontrada') }))
    matchId: string,
    @Body(authValidationPipe) dto: FinishQuickMatchDto,
    @Request() req,
  ) {
    return this.soloMatchesService.finishQuickMatch(req.user.userId, matchId, dto.answers);
  }
}
