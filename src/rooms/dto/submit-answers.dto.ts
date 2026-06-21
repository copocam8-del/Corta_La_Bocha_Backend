import { IsArray, IsString, IsUUID, IsOptional, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

class CategoryAnswerDto {
  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsString()
  answerText: string | null;
}

export class SubmitAnswersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CategoryAnswerDto)
  answers: CategoryAnswerDto[];
} 