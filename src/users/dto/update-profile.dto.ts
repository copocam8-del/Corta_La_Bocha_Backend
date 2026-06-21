import { IsString, IsOptional, MinLength, MaxLength, IsUrl } from 'class-validator'

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string

  @IsOptional()
  @IsUrl()
  avatar_url?: string
}
