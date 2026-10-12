import { IsIn, IsInt, IsOptional } from 'class-validator';
import { TEMATICAS } from '../../solo-matches/solo-quick';
import { ROUND_OPTIONS, SECONDS_OPTIONS } from '../game-engine';

// Configuración inicial de una sala privada (el anfitrión la puede cambiar en el lobby)
export class CreateRoomDto {
  @IsIn(Object.keys(TEMATICAS), { message: 'Temática inválida' })
  @IsOptional()
  tematica?: string;

  @IsIn(ROUND_OPTIONS, { message: `Las rondas pueden ser ${ROUND_OPTIONS.join(', ')}` })
  @IsInt({ message: 'Las rondas deben ser un número entero' })
  @IsOptional()
  rounds?: number;

  @IsIn(SECONDS_OPTIONS, { message: `El tiempo puede ser ${SECONDS_OPTIONS.join(', ')} segundos` })
  @IsInt({ message: 'El tiempo debe ser un número entero' })
  @IsOptional()
  seconds?: number;
}
