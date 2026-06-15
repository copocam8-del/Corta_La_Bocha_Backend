import { IsString, IsNotEmpty, IsOptional, ValidateNested, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CategoryAnswerDto {
  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value?.trim()))
  answer: string | null;
}

export class ValidateRoundDto {
  @IsString()
  @IsNotEmpty()
  roundLetter: string;

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
  aiAnswer: string | null;
  isValid: boolean;
  reason?: string;
  points: number;
}

export class ValidateRoundResponseDto {
  roundLetter: string;
  totalPoints: number;
  results: ValidationResultDto[];
  timestamp: string;
}

export class AiValidationPayload {
  category: string;
  roundLetter: string;
  userAnswer: string;
}
