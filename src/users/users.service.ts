import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const PROFILE_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  avatar_url: true,
  bio: true,
  games_played: true,
  games_won: true,
  total_points: true,
  created_at: true,
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: PROFILE_SELECT,
    })
  }

  findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: PROFILE_SELECT,
    })
  }

  update(id: string, data: { name?: string; bio?: string; avatar_url?: string }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: PROFILE_SELECT,
    })
  }

  delete(id: string) {
    return this.prisma.user.delete({
      where: { id },
    })
  }
} 