import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { authValidationPipe } from '../auth/auth-validation.pipe';
import { TEMAS_MEMOTEST, type NivelMemotest, type TemaMemotest } from './memotest-rules';
import { MemotestService } from './memotest.service';

class EmpezarMemotestDto {
  @IsIn(Object.keys(TEMAS_MEMOTEST), { message: 'Tema inválido' })
  tema: TemaMemotest;

  @IsIn(['facil', 'medio', 'dificil'], { message: 'Nivel inválido' })
  nivel: NivelMemotest;
}

class VoltearDto {
  @Max(40, { message: 'Carta inválida' })
  @Min(0, { message: 'Carta inválida' })
  @IsInt({ message: 'Carta inválida' })
  carta: number;
}

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Partida no encontrada') });

// Memotest: el servidor guarda el mazo, revela cada carta al darla vuelta y decide si es par.
@UseGuards(AuthGuard('jwt'))
@Controller('memotest')
export class MemotestController {
  constructor(private readonly memotest: MemotestService) {}

  @Get('temas')
  temas() {
    return this.memotest.temas();
  }

  @Post()
  empezar(@Body(authValidationPipe) dto: EmpezarMemotestDto, @Request() req) {
    return this.memotest.empezar(req.user.userId, dto.tema, dto.nivel);
  }

  @Post(':id/voltear')
  voltear(@Param('id', uuid) id: string, @Body(authValidationPipe) dto: VoltearDto, @Request() req) {
    return this.memotest.voltear(req.user.userId, id, dto.carta);
  }

  @Post(':id/rendirse')
  rendirse(@Param('id', uuid) id: string, @Request() req) {
    return this.memotest.rendirse(req.user.userId, id);
  }
}
