import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

// Lo que cualquier usuario logueado puede ver de otro: sin email, fecha de nacimiento
// ni nombre y apellido reales (puede haber menores de edad registrados).
const PUBLIC_PROFILE_SELECT = {
  id: true,
  username: true,
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

// Datos completos: sólo para el propio usuario (GET/PUT /users/me)
const OWN_PROFILE_SELECT = {
  ...PUBLIC_PROFILE_SELECT,
  email: true,
  first_name: true,
  last_name: true,
  birth_date: true,
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.users.findMany({
      select: PUBLIC_PROFILE_SELECT,
      orderBy: { username: 'asc' },
    })
  }

  // Perfil público de otro usuario
  async findPublic(id: string) {
    const user = await this.prisma.users.findUnique({
      where: { id },
      select: PUBLIC_PROFILE_SELECT,
    })
    if (!user) throw new NotFoundException('Usuario no encontrado')
    return user
  }

  // Perfil completo del usuario logueado
  async findOwn(id: string) {
    const user = await this.prisma.users.findUnique({
      where: { id },
      select: OWN_PROFILE_SELECT,
    })
    if (!user) throw new NotFoundException('Usuario no encontrado')
    return user
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
      select: OWN_PROFILE_SELECT,
    })
  }
}