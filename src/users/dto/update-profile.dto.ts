import { IsString, IsOptional, MinLength, MaxLength, IsUrl } from 'class-validator'

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string

  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string

  @IsOptional()
  @IsUrl()
  avatar_url?: string

  @IsOptional()
  @IsString()
  favorite_team?: string
}