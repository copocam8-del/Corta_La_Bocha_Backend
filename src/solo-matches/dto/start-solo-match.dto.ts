import { IsArray, IsString, IsUUID, IsIn, IsInt, Min, Max, ArrayMinSize } from 'class-validator';

export class StartSoloMatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  categoryIds: string[];

  @IsInt()
  @Min(15)
  @Max(180)
  roundSeconds: number;

  @IsIn(['easy', 'medium', 'hard', 'expert'])
  aiDifficulty: string;
} 