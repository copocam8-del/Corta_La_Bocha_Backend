import { Module } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { PrismaModule } from '../prisma/prisma.module'
import { StatsModule } from '../stats/stats.module'
import { AchievementsModule } from '../achievements/achievements.module'

@Module({
  imports: [PrismaModule, StatsModule, AchievementsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
 