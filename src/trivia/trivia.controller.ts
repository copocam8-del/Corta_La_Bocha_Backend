import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { authValidationPipe } from '../auth/auth-validation.pipe';
import { CATEGORIAS_TRIVIA, type CategoriaTrivia, type DificultadTrivia } from './trivia-bank';
import { TriviaService } from './trivia.service';

class EmpezarTriviaDto {
  @IsIn(CATEGORIAS_TRIVIA, { message: 'Categoría inválida' })
  @IsOptional()
  categoria?: CategoriaTrivia;

  @IsIn(['facil', 'medio', 'dificil'], { message: 'Dificultad inválida' })
  @IsOptional()
  dificultad?: DificultadTrivia;
}

class ResponderDto {
  // null = se acabó el tiempo sin responder
  @Max(3, { message: 'Opción inválida' })
  @Min(0, { message: 'Opción inválida' })
  @IsInt({ message: 'Opción inválida' })
  @ValidateIf((o: ResponderDto) => o.opcion !== null)
  opcion: number | null;
}

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Partida no encontrada') });

// Trivia futbolera: el servidor guarda cuál es la opción correcta, mide el tiempo y corrige.
@UseGuards(AuthGuard('jwt'))
@Controller('trivia')
export class TriviaController {
  constructor(private readonly trivia: TriviaService) {}

  @Get('categorias')
  categorias() {
    return this.trivia.categorias();
  }

  @Post()
  empezar(@Body(authValidationPipe) dto: EmpezarTriviaDto, @Request() req) {
    return this.trivia.empezar(req.user.userId, { categoria: dto.categoria, dificultad: dto.dificultad });
  }

  @Post(':id/responder')
  responder(@Param('id', uuid) id: string, @Body(authValidationPipe) dto: ResponderDto, @Request() req) {
    return this.trivia.responder(req.user.userId, id, dto.opcion ?? null);
  }
}
