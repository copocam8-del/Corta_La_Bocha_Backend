import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { TuttiFruttiModule } from './tutti-frutti/tutti-frutti.module';
import { RoomsModule } from './rooms/rooms.module';
import { SoloMatchesModule } from './solo-matches/solo-matches.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    TuttiFruttiModule,
    RoomsModule,
    SoloMatchesModule,
  ],
})
export class AppModule {} 