import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { TuttiFruttiValidatorService } from './tutti-frutti.service';
import { ValidateRoundDto, ValidateRoundResponseDto } from './dto/validate-round.dto';
import { authValidationPipe } from '../auth/auth-validation.pipe';

@Controller('tutti-frutti')
export class TuttiFruttiController {
  constructor(private readonly tuttiFruttiService: TuttiFruttiValidatorService) {}

  // Valida una ronda suelta de un jugador. Cada llamada usa el proveedor de IA (cuesta plata), así que
  // pide sesión y tiene límite de intentos. El juego usa /solo-matches/quick; esto queda para pruebas.
  @UseGuards(AuthGuard('jwt'), ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('validate-round')
  @HttpCode(HttpStatus.OK)
  validateRound(@Body(authValidationPipe) dto: ValidateRoundDto): Promise<ValidateRoundResponseDto> {
    return this.tuttiFruttiService.validateRound(dto);
  }
}
