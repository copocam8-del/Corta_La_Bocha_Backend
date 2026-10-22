import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsIn } from 'class-validator';
import { authValidationPipe } from '../auth/auth-validation.pipe';
import { IMPOSTOR_RONDAS } from '../rooms/modes/impostor.mode';
import { TEMATICAS_IMPOSTOR, type TematicaImpostor } from './impostor-rules';
import { ImpostorService } from './impostor.service';

export class PalabrasLocalDto {
  @IsIn(TEMATICAS_IMPOSTOR, { message: 'Temática inválida' })
  tematica: TematicaImpostor;

  @IsIn(IMPOSTOR_RONDAS, { message: 'Las rondas pueden ser 1, 3 o 5' })
  rondas: number;
}

// El Impostor "En persona": devuelve una palabra (texto + categoría) por ronda. Pide sesión y tiene
// límite de 20 por minuto por IP (cada pedido lee y escribe "contenido visto").
@UseGuards(AuthGuard('jwt'))
@Controller('impostor')
export class ImpostorController {
  constructor(private readonly impostor: ImpostorService) {}

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(ThrottlerGuard)
  @Post('local')
  local(@Body(authValidationPipe) dto: PalabrasLocalDto, @Request() req) {
    return this.impostor.palabrasLocal(req.user.userId, dto.tematica, dto.rondas);
  }
}
