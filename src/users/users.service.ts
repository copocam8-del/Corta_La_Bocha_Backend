import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

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
      avatar_url: true,
      bio: true,
      favorite_team: true,
      favorite_country: true,
      favorite_player: true,
      matches_played: true,
      matches_won: true,
      tournaments_won: true,
      total_points: true,
      best_streak: true,
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

  update(
    id: string,
    data: { username?: string; bio?: string; avatar_url?: string; favorite_team?: string },
  ) {
    const { username, ...profileFields } = data

    return this.prisma.users.update({
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
  }

  delete(id: string) {
    return this.prisma.users.delete({
      where: { id },
    })
  }
}