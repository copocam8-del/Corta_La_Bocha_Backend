import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { CreateRoomDto } from './dto/create-room.dto';
import { StartMatchDto } from './dto/start-match.dto';
import { SubmitAnswersDto } from './dto/submit-answers.dto';
import { VoteAnswerDto } from './dto/vote-answer.dto';

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

  @UseGuards(AuthGuard('jwt'))
  @Post(':code/matches/:matchId/rounds/:roundId/answers')
  async submitAnswers(
    @Param('code') code: string,
    @Param('matchId') matchId: string,
    @Param('roundId') roundId: string,
    @Body() dto: SubmitAnswersDto,
    @Request() req,
  ) {
    const result = await this.roomsService.submitAnswers(matchId, roundId, req.user.userId, dto.answers);
    this.roomsGateway.emitToRoom(code.toUpperCase(), 'player_answered', {
      userId: req.user.userId,
      roomPlayerId: result.roomPlayerId,
    });
    return result;
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':code/matches/:matchId/rounds/:roundId/close')
  async closeRound(
    @Param('code') code: string,
    @Param('matchId') matchId: string,
    @Param('roundId') roundId: string,
    @Request() req,
  ) {
    const result = await this.roomsService.closeRoundForVoting(matchId, roundId, req.user.userId);
    this.roomsGateway.emitToRoom(code.toUpperCase(), 'voting_started', result);
    return result;
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':code/answers/:answerId/vote')
  async vote(
    @Param('code') code: string,
    @Param('answerId') answerId: string,
    @Body() dto: VoteAnswerDto,
    @Request() req,
  ) {
    const result = await this.roomsService.voteAnswer(answerId, req.user.userId, dto.approve);
    this.roomsGateway.emitToRoom(code.toUpperCase(), 'answer_voted', {
      answerId,
      voterUserId: req.user.userId,
      approve: dto.approve,
    });
    return result;
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':code/matches/:matchId/rounds/:roundId/tally')
  async tally(
    @Param('code') code: string,
    @Param('matchId') matchId: string,
    @Param('roundId') roundId: string,
  ) {
    const result = await this.roomsService.tallyRoundVotes(matchId, roundId);
    this.roomsGateway.emitToRoom(code.toUpperCase(), 'round_finished', result);
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