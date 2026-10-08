import { ConflictException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateProfileDto } from './dto/update-profile.dto'

const PROFILE_SELECT = {
  id: true,
  username: true,
  email: true,
  first_name: true,
  last_name: true,
  birth_date: true,
  country: true,
  created_at: true,
  profile: {
    select: {
      avatar_id: true,
      bio: true,
      favorite_team: true,
      favorite_country: true,
      favorite_player: true,
      matches_played: true,
      matches_won: true,
      tournaments_won: true,
      total_points: true,
      best_streak: true,
      current_streak: true,
    },
  },
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.users.findMany({
      select: PROFILE_SELECT,
    })
  }

  findOne(id: string) {
    return this.prisma.users.findUnique({
      where: { id },
      select: PROFILE_SELECT,
    })
  }

  async update(id: string, data: UpdateProfileDto) {
    const { username, ...profileFields } = data

    if (username) {
      // "Messi" y "messi" cuentan como el mismo nombre de usuario
      const taken = await this.prisma.users.findFirst({
        where: { username: { equals: username, mode: 'insensitive' }, NOT: { id } },
        select: { id: true },
      })
      if (taken) throw new ConflictException('Nombre de usuario ya en uso')
    }

    try {
      return await this.prisma.users.update({
        where: { id },
        data: {
          ...(username ? { username } : {}),
          profile: {
            upsert: {
              create: profileFields,
              update: profileFields,
            },
          },
        },
        select: PROFILE_SELECT,
      })
    } catch (e) {
      // Dos usuarios eligiendo el mismo nombre a la vez: la base frena el segundo
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Nombre de usuario ya en uso')
      }
      throw e
    }
  }
}