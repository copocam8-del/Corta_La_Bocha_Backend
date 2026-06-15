import { Controller, Post, Body, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { TuttiFruttiValidatorService } from './tutti-frutti.service';
import { ValidateRoundDto, ValidateRoundResponseDto } from './dto/validate-round.dto';

@Controller('tutti-frutti')
export class TuttiFruttiController {
  constructor(private readonly tuttiFruttiService: TuttiFruttiValidatorService) {}

  @Post('validate-round')
  @HttpCode(HttpStatus.OK)
  async validateRound(@Body() dto: ValidateRoundDto): Promise<ValidateRoundResponseDto> {
    if (!dto) {
      throw new BadRequestException('Request body is required');
    }

    return this.tuttiFruttiService.validateRound(dto);
  }
}
