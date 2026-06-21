import { IsBoolean, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateRoomDto {
  @IsOptional()
  @IsBoolean()
  is_private?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(8)
  max_players?: number;
} 