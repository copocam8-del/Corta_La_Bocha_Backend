import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DIFICULTADES, ROUND_SECONDS, TEMATICAS } from '../solo-quick';

export class StartQuickMatchDto {
  @IsIn(Object.keys(TEMATICAS), { message: 'Temática inválida' })
  tematica: string;

  @IsIn(Object.keys(DIFICULTADES), { message: 'Dificultad inválida' })
  dificultad: string;

  @IsIn(ROUND_SECONDS, { message: 'El tiempo debe ser 60 o 120 segundos' })
  @IsInt({ message: 'El tiempo debe ser un número entero' })
  tiempo: number;
}

export class QuickAnswerDto {
  @IsString({ message: 'La categoría debe ser texto' })
  category: string;

  @MaxLength(150, { message: 'La respuesta puede tener hasta 150 caracteres' })
  @IsString({ message: 'La respuesta debe ser texto' })
  @IsOptional()
  answer?: string | null;
}

export class FinishQuickMatchDto {
  @ValidateNested({ each: true })
  @Type(() => QuickAnswerDto)
  @ArrayMaxSize(10, { message: 'Demasiadas respuestas' })
  @IsArray({ message: 'Las respuestas deben ser una lista' })
  answers: QuickAnswerDto[];
}
