import { Controller, Post, Body, Param, UseGuards, Request, ParseUUIDPipe, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SoloMatchesService } from './solo-matches.service';
import { StartSoloMatchDto } from './dto/start-solo-match.dto';
import { SubmitSoloAnswersDto } from './dto/submit-solo-answers.dto';
import { FinishQuickMatchDto, StartQuickMatchDto } from './dto/quick-match.dto';
import { authValidationPipe } from '../auth/auth-validation.pipe';

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

  @Post()
  start(@Body() dto: StartSoloMatchDto, @Request() req) {
    return this.soloMatchesService.startMatch(req.user.userId, dto);
  }

  @Post(':matchId/rounds/:roundId/answers')
  submitAnswers(
    @Param('matchId') matchId: string,
    @Param('roundId') roundId: string,
    @Body() dto: SubmitSoloAnswersDto,
  ) {
    return this.soloMatchesService.submitAnswers(matchId, roundId, dto.answers);
  }

  @Post(':matchId/rounds/:roundId/validate')
  validate(@Param('matchId') matchId: string, @Param('roundId') roundId: string) {
    return this.soloMatchesService.validateRoundWithAi(matchId, roundId);
  }
} 