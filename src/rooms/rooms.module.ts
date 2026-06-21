import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomsGateway, PrismaService],
})
export class RoomsModule {} 