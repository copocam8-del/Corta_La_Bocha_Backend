import { Module } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { PrismaModule } from '../prisma/prisma.module'
import { StatsModule } from '../stats/stats.module'

@Module({
  imports: [PrismaModule, StatsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
 