import { IsOptional, IsString, MaxLength } from 'class-validator'

// DELETE /users/me: la confirmación para borrar la cuenta. Si tiene contraseña, la contraseña; si entró sólo con
// Google, su nombre de usuario (qué hace falta lo decide el servidor, no el que manda el pedido).
export class BorrarCuentaDto {
  @IsOptional()
  @MaxLength(200, { message: 'La contraseña no es correcta.' })
  @IsString({ message: 'La contraseña no es correcta.' })
  password?: string

  @IsOptional()
  @MaxLength(60, { message: 'El nombre de usuario no coincide.' })
  @IsString({ message: 'El nombre de usuario no coincide.' })
  confirmacion?: string
}
