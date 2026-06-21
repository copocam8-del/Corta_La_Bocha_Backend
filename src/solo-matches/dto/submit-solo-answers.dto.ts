import { IsArray, IsUUID, IsOptional, IsString, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

class SoloCategoryAnswerDto {
  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsString()
  answerText: string | null;
}

export class SubmitSoloAnswersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SoloCategoryAnswerDto)
  answers: SoloCategoryAnswerDto[];
} 