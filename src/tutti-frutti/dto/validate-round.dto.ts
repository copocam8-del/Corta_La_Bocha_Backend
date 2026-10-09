import { IsString, IsNotEmpty, IsOptional, ValidateNested, IsArray, ArrayMaxSize, MaxLength } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import type { AnswerStatus } from '../scoring';

export class CategoryAnswerDto {
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
  @IsString()
  @IsNotEmpty()
  roundLetter: string;

  @ArrayMaxSize(10)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryAnswerDto)
  answers: CategoryAnswerDto[];

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
