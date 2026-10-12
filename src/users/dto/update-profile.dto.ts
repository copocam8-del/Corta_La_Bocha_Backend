import { Transform } from 'class-transformer'
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator'
import { NAME_MAX, USERNAME_MAX, USERNAME_MIN, USERNAME_REGEX } from '../../auth/dto/auth-rules'
import { AVATAR_IDS } from '../avatars'

// Campos de texto del perfil: "" significa "borrar" (se guarda null)
const TrimOrNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })

// Nombre y apellido no se pueden borrar: si llegan "", sólo espacios o null, se ignoran (no se tocan)
const TrimOrIgnore = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === null) return undefined
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  })

// Los decoradores se evalúan de abajo hacia arriba (ver auth/dto/register.dto.ts).
// IsOptional deja pasar null (= borrar el campo) sin validar el resto.
export class UpdateProfileDto {
  // Mismas reglas que en el registro (RegisterDto.name / lastName)
  @MaxLength(NAME_MAX, { message: `El nombre puede tener hasta ${NAME_MAX} caracteres` })
  @IsString({ message: 'El nombre debe ser texto' })
  @IsOptional()
  @TrimOrIgnore()
  first_name?: string

  @MaxLength(NAME_MAX, { message: `El apellido puede tener hasta ${NAME_MAX} caracteres` })
  @IsString({ message: 'El apellido debe ser texto' })
  @IsOptional()
  @TrimOrIgnore()
  last_name?: string

  @Matches(USERNAME_REGEX, { message: 'El nombre de usuario sólo puede tener letras, números y _' })
  @Length(USERNAME_MIN, USERNAME_MAX, {
    message: `El nombre de usuario debe tener entre ${USERNAME_MIN} y ${USERNAME_MAX} caracteres`,
  })
  @IsString({ message: 'El nombre de usuario debe ser texto' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value))
  username?: string

  @MaxLength(160, { message: 'La bio puede tener hasta 160 caracteres' })
  @IsString({ message: 'La bio debe ser texto' })
  @IsOptional()
  @TrimOrNull()
  bio?: string | null

  @IsIn(AVATAR_IDS, { message: 'Elegí uno de los avatares disponibles' })
  @IsOptional()
  avatar_id?: string | null

  @MaxLength(100, { message: 'El equipo favorito puede tener hasta 100 caracteres' })
  @IsString({ message: 'El equipo favorito debe ser texto' })
  @IsOptional()
  @TrimOrNull()
  favorite_team?: string | null

  @MaxLength(100, { message: 'El país favorito puede tener hasta 100 caracteres' })
  @IsString({ message: 'El país favorito debe ser texto' })
  @IsOptional()
  @TrimOrNull()
  favorite_country?: string | null

  @MaxLength(100, { message: 'El jugador favorito puede tener hasta 100 caracteres' })
  @IsString({ message: 'El jugador favorito debe ser texto' })
  @IsOptional()
  @TrimOrNull()
  favorite_player?: string | null
}
