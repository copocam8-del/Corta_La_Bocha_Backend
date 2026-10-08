import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NormalizeEmail, PASSWORD_MAX } from './auth-rules';

// Los decoradores se evalúan de abajo hacia arriba (ver register.dto.ts)
export class LoginDto {
  @IsEmail({}, { message: 'El email no es válido' })
  @IsNotEmpty({ message: 'Ingresá tu email' })
  @NormalizeEmail()
  email: string;

  // En el login no exigimos el mínimo de 8: hay cuentas viejas creadas con la regla anterior (6)
  @MaxLength(PASSWORD_MAX, { message: `La contraseña puede tener hasta ${PASSWORD_MAX} caracteres` })
  @IsString({ message: 'La contraseña debe ser texto' })
  @IsNotEmpty({ message: 'Ingresá tu contraseña' })
  password: string;
}
