import { IsBoolean } from 'class-validator';

export class VoteAnswerDto {
  @IsBoolean()
  approve: boolean;
} 