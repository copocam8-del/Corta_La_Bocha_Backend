import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  // ID token que Google Identity Services le da al frontend
  @MaxLength(4096, { message: 'La credencial de Google no es válida' })
  @IsString({ message: 'La credencial de Google no es válida' })
  @IsNotEmpty({ message: 'Falta la credencial de Google' })
  credential: string;
}
