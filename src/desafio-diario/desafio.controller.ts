import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsInt, Max, Min, ValidateIf } from 'class-validator';
import { authValidationPipe } from '../auth/auth-validation.pipe';
import { DesafioService } from './desafio.service';

class ResponderDto {
  // null = se acabó el tiempo sin responder
  @Max(3, { message: 'Opción inválida' })
  @Min(0, { message: 'Opción inválida' })
  @IsInt({ message: 'Opción inválida' })
  @ValidateIf((o: ResponderDto) => o.opcion !== null)
  opcion: number | null;
}

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Partida no encontrada') });

// Desafío del día: la misma serie de preguntas para todos, una sola vez por día (hora argentina).
@UseGuards(AuthGuard('jwt'))
@Controller('desafio-diario')
export class DesafioController {
  constructor(private readonly desafio: DesafioService) {}

  @Get('hoy')
  hoy(@Request() req) {
    return this.desafio.hoy(req.user.userId);
  }

  @Post('empezar')
  empezar(@Request() req) {
    return this.desafio.empezar(req.user.userId);
  }

  @Post(':id/responder')
  responder(@Param('id', uuid) id: string, @Body(authValidationPipe) dto: ResponderDto, @Request() req) {
    return this.desafio.responder(req.user.userId, id, dto.opcion ?? null);
  }

  @Get('tabla')
  tabla(@Request() req) {
    return this.desafio.tabla(req.user.userId);
  }
}
