import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

// POST /users/me/aceptar-terminos: la versión de los Términos que el usuario leyó y aceptó (la que le mostró la app)
export class AceptarTerminosDto {
  @MaxLength(20, { message: 'La versión de los Términos no es válida' })
  @IsString({ message: 'La versión de los Términos no es válida' })
  @IsNotEmpty({ message: 'Falta la versión de los Términos' })
  version: string
}
