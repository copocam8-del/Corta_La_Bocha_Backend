import { Module } from '@nestjs/common';
import { SoloMatchesController } from './solo-matches.controller';
import { SoloMatchesService } from './solo-matches.service';
import { PrismaService } from '../prisma/prisma.service';
import { TuttiFruttiModule } from '../tutti-frutti/tutti-frutti.module';

@Module({
  imports: [TuttiFruttiModule],
  controllers: [SoloMatchesController],
  providers: [SoloMatchesService, PrismaService],
})
export class SoloMatchesModule {} 