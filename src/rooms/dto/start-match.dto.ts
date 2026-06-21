import { IsArray, IsString, IsInt, Min, Max, ArrayMinSize } from 'class-validator';

export class StartMatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  categoryIds: string[];

  @IsInt()
  @Min(15)
  @Max(180)
  roundSeconds: number;
} 