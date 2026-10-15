import { IsString, IsNotEmpty, IsOptional, ValidateNested, IsArray, ArrayMaxSize, MaxLength } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import type { AnswerStatus } from '../scoring';

// Límites de largo: las categorías tienen menos de 40 letras y un texto gigante no tiene que llegar al servicio
export class CategoryAnswerDto {
  @MaxLength(40)
  @IsString()
  @IsNotEmpty()
  category: string;

  @MaxLength(150)
  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value))
  answer: string | null;
}

export class ValidateRoundDto {
  @MaxLength(2)
  @IsString()
  @IsNotEmpty()
  roundLetter: string;

  @ArrayMaxSize(10)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryAnswerDto)
  answers: CategoryAnswerDto[];

  @MaxLength(36)
  @IsOptional()
  @IsString()
  matchId?: string;
}

export class ValidationResultDto {
  category: string;
  userAnswer: string | null;
  status: AnswerStatus; // valid | invalid | empty | unverified
  isValid: boolean;
  canonical: string | null; // nombre que reconoció la IA
  reason: string; // en español
  points: number;
}

export class ValidateRoundResponseDto {
  roundLetter: string;
  totalPoints: number;
  results: ValidationResultDto[];
  validationIncomplete: boolean; // true si la IA no respondió y alguna quedó sin validar
  timestamp: string;
}
