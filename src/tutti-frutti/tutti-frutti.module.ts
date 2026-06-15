import { Module } from '@nestjs/common';
import { TuttiFruttiController } from './tutti-frutti.controller';
import { TuttiFruttiValidatorService } from './tutti-frutti.service';

@Module({
  controllers: [TuttiFruttiController],
  providers: [TuttiFruttiValidatorService],
  exports: [TuttiFruttiValidatorService],
})
export class TuttiFruttiModule {}
