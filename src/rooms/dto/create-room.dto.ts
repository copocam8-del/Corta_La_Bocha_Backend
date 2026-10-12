import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { MULTI_GAMES, type MultiGameId } from '../modes/types';

// Configuración inicial de una sala privada (el anfitrión la puede cambiar en el lobby). Qué
// valores valen depende del juego: los controla el modo de cada juego (validSettings) → 400.
export class CreateRoomDto {
  @IsIn(MULTI_GAMES, { message: 'Juego inválido' })
  @IsOptional()
  game?: MultiGameId;

  @MaxLength(40)
  @IsString({ message: 'Temática inválida' })
  @IsOptional()
  tematica?: string;

  @MaxLength(20)
  @IsString({ message: 'Dificultad inválida' })
  @IsOptional()
  dificultad?: string;

  @IsInt({ message: 'Las rondas deben ser un número entero' })
  @IsOptional()
  rounds?: number;

  @IsInt({ message: 'El tiempo debe ser un número entero' })
  @IsOptional()
  seconds?: number;
}
