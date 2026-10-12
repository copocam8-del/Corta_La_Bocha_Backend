import { Body, Controller, NotFoundException, Param, ParseUUIDPipe, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { authValidationPipe } from '../auth/auth-validation.pipe';
import { AhorcadoService } from './ahorcado.service';
import type { Dificultad } from './ahorcado-bank';

class EmpezarDto {
  @IsIn(['facil', 'medio', 'dificil'], { message: 'Dificultad inválida' })
  dificultad: Dificultad;
}

class LetraDto {
  @MaxLength(2, { message: 'Mandá una sola letra' })
  @IsString({ message: 'La letra debe ser texto' })
  letra: string;
}

class ArriesgarDto {
  @MaxLength(60, { message: 'La respuesta es demasiado larga' })
  @IsString({ message: 'La respuesta debe ser texto' })
  respuesta: string;
}

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Partida no encontrada') });

// Ahorcado "Que no muera la redonda". El servidor elige la palabra y corrige cada letra:
// el navegador nunca recibe la respuesta hasta que la partida termina.
@UseGuards(AuthGuard('jwt'))
@Controller('ahorcado')
export class AhorcadoController {
  constructor(private readonly ahorcado: AhorcadoService) {}

  @Post()
  empezar(@Body(authValidationPipe) dto: EmpezarDto, @Request() req) {
    return this.ahorcado.empezar(req.user.userId, dto.dificultad);
  }

  @Post(':id/letra')
  letra(@Param('id', uuid) id: string, @Body(authValidationPipe) dto: LetraDto, @Request() req) {
    return this.ahorcado.letra(req.user.userId, id, dto.letra);
  }

  @Post(':id/arriesgar')
  arriesgar(@Param('id', uuid) id: string, @Body(authValidationPipe) dto: ArriesgarDto, @Request() req) {
    return this.ahorcado.arriesgar(req.user.userId, id, dto.respuesta);
  }

  @Post(':id/rendirse')
  rendirse(@Param('id', uuid) id: string, @Request() req) {
    return this.ahorcado.rendirse(req.user.userId, id);
  }
}
