import { Module } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { PrismaModule } from '../prisma/prisma.module'
import { StatsModule } from '../stats/stats.module'
import { AchievementsModule } from '../achievements/achievements.module'
import { RoomsModule } from '../rooms/rooms.module'

@Module({
  // RoomsModule: sacar de las salas al que borra su cuenta
  imports: [PrismaModule, StatsModule, AchievementsModule, RoomsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
 