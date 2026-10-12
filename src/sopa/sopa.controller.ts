import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min, ValidateNested } from 'class-validator';
import { authValidationPipe } from '../auth/auth-validation.pipe';
import { TEMATICAS_SOPA, type DificultadSopa, type TematicaSopa } from './sopa-rules';
import { SopaService } from './sopa.service';

class EmpezarSopaDto {
  @IsIn(Object.keys(TEMATICAS_SOPA), { message: 'Temática inválida' })
  tematica: TematicaSopa;

  @IsIn(['facil', 'medio', 'dificil'], { message: 'Dificultad inválida' })
  dificultad: DificultadSopa;
}

class CeldaDto {
  @Max(30, { message: 'Celda inválida' })
  @Min(0, { message: 'Celda inválida' })
  @IsInt({ message: 'Celda inválida' })
  f: number;

  @Max(30, { message: 'Celda inválida' })
  @Min(0, { message: 'Celda inválida' })
  @IsInt({ message: 'Celda inválida' })
  c: number;
}

class MarcarDto {
  @ValidateNested()
  @Type(() => CeldaDto)
  desde: CeldaDto;

  @ValidateNested()
  @Type(() => CeldaDto)
  hasta: CeldaDto;
}

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Partida no encontrada') });

// Sopa de letras: el servidor arma la grilla, guarda dónde está cada palabra y verifica cada marca.
@UseGuards(AuthGuard('jwt'))
@Controller('sopa')
export class SopaController {
  constructor(private readonly sopa: SopaService) {}

  @Get('tematicas')
  tematicas() {
    return this.sopa.tematicas();
  }

  @Post()
  empezar(@Body(authValidationPipe) dto: EmpezarSopaDto, @Request() req) {
    return this.sopa.empezar(req.user.userId, dto.tematica, dto.dificultad);
  }

  @Post(':id/marcar')
  marcar(@Param('id', uuid) id: string, @Body(authValidationPipe) dto: MarcarDto, @Request() req) {
    return this.sopa.marcar(req.user.userId, id, dto.desde, dto.hasta);
  }

  @Post(':id/terminar')
  terminar(@Param('id', uuid) id: string, @Request() req) {
    return this.sopa.terminarAhora(req.user.userId, id);
  }
}
