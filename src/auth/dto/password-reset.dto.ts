import { IsEmail, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';
import { NormalizeEmail, NotCommonPassword, PASSWORD_MAX, PASSWORD_MIN } from './auth-rules';

export class ForgotPasswordDto {
  @MaxLength(255, { message: 'El email es demasiado largo' })
  @IsEmail({}, { message: 'El email no es válido' })
  @IsNotEmpty({ message: 'Ingresá tu email' })
  @NormalizeEmail()
  email: string;
}

export class ResetPasswordDto {
  @MaxLength(200, { message: 'El link no es válido' })
  @IsString({ message: 'El link no es válido' })
  @IsNotEmpty({ message: 'El link no es válido' })
  token: string;

  // Mismas reglas que en el registro
  @NotCommonPassword()
  @Length(PASSWORD_MIN, PASSWORD_MAX, {
    message: `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres`,
  })
  @IsString({ message: 'La contraseña debe ser texto' })
  @IsNotEmpty({ message: 'Ingresá una contraseña' })
  password: string;
}
