import { IsEmail, IsNotEmpty, IsString, IsOptional, IsDateString, Length, Matches, MaxLength } from 'class-validator';
import {
  MIN_AGE,
  MinAge,
  NormalizeEmail,
  PASSWORD_MAX,
  PASSWORD_MIN,
  Trim,
  USERNAME_MAX,
  USERNAME_MIN,
  USERNAME_REGEX,
} from './auth-rules';

// Ojo con el orden: class-validator evalúa los decoradores de abajo hacia arriba y,
// como el pipe usa stopAtFirstError, sólo se muestra el primer error. Por eso la regla
// más básica (campo vacío / tipo) va abajo de todo, pegada a la propiedad.
export class RegisterDto {
  @Matches(USERNAME_REGEX, { message: 'El nombre de usuario sólo puede tener letras, números y _' })
  @Length(USERNAME_MIN, USERNAME_MAX, {
    message: `El nombre de usuario debe tener entre ${USERNAME_MIN} y ${USERNAME_MAX} caracteres`,
  })
  @IsString({ message: 'El nombre de usuario debe ser texto' })
  @IsOptional()
  @Trim()
  username?: string;

  @MaxLength(50, { message: 'El nombre puede tener hasta 50 caracteres' })
  @IsString({ message: 'El nombre debe ser texto' })
  @IsOptional()
  @Trim()
  name?: string;

  @MaxLength(50, { message: 'El apellido puede tener hasta 50 caracteres' })
  @IsString({ message: 'El apellido debe ser texto' })
  @IsOptional()
  @Trim()
  lastName?: string;

  @MinAge(MIN_AGE, { message: `Tenés que tener al menos ${MIN_AGE} años para registrarte` })
  @IsDateString({}, { message: 'La fecha de nacimiento no es válida' })
  @IsNotEmpty({ message: 'Ingresá tu fecha de nacimiento' })
  birthDate: string;

  @MaxLength(56, { message: 'El país puede tener hasta 56 caracteres' })
  @IsString({ message: 'El país debe ser texto' })
  @IsOptional()
  country?: string;

  @MaxLength(255, { message: 'El email es demasiado largo' })
  @IsEmail({}, { message: 'El email no es válido' })
  @IsNotEmpty({ message: 'Ingresá tu email' })
  @NormalizeEmail()
  email: string;

  @Length(PASSWORD_MIN, PASSWORD_MAX, {
    message: `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres`,
  })
  @IsString({ message: 'La contraseña debe ser texto' })
  @IsNotEmpty({ message: 'Ingresá una contraseña' })
  password: string;
}
