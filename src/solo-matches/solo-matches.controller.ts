import { Controller, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SoloMatchesService } from './solo-matches.service';
import { StartSoloMatchDto } from './dto/start-solo-match.dto';
import { SubmitSoloAnswersDto } from './dto/submit-solo-answers.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('solo-matches')
export class SoloMatchesController {
  constructor(private readonly soloMatchesService: SoloMatchesService) {}

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