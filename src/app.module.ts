import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { TuttiFruttiModule } from './tutti-frutti/tutti-frutti.module';
import { RoomsModule } from './rooms/rooms.module';
import { SoloMatchesModule } from './solo-matches/solo-matches.module';
import { CategoriesModule } from './categories/categories.module';
import { GamesModule } from './games/games.module';
import { AhorcadoModule } from './ahorcado/ahorcado.module';
import { TriviaModule } from './trivia/trivia.module';
import { DesafioModule } from './desafio-diario/desafio.module';
import { SopaModule } from './sopa/sopa.module';
import { MemotestModule } from './memotest/memotest.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    TuttiFruttiModule,
    RoomsModule,
    SoloMatchesModule,
    CategoriesModule,
    GamesModule,
    AhorcadoModule,
    TriviaModule,
    DesafioModule,
    SopaModule,
    MemotestModule,
    AdminModule,
  ],
})
export class AppModule {} 