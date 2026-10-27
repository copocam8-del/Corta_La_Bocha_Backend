import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { ConfigService } from '@nestjs/config'
import { isAdminEmail, parseAdminEmails } from '../admin/admin-access'
import { MENSAJE_VERSION_TERMINOS, TERMS_VERSION, terminosPendientes } from '../legal/terminos'
import { MultiplayerService } from '../rooms/multiplayer.service'
import { BorrarCuentaDto } from './dto/borrar-cuenta.dto'

export const MENSAJE_CONTRASENA_INCORRECTA = 'La contraseña no es correcta.'
export const MENSAJE_FALTA_CONTRASENA = 'Escribí tu contraseña para confirmar.'
export const MENSAJE_USUARIO_NO_COINCIDE = 'Escribí tu nombre de usuario para confirmar.'

// Lo que cualquier usuario logueado puede ver de otro: sin email, fecha de nacimiento
// ni nombre y apellido reales (puede haber menores de edad registrados).
const PUBLIC_PROFILE_SELECT = {
  id: true,
  username: true,
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
      elo: true,
      elo_games: true,
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
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private multiplayer: MultiplayerService,
  ) {}

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
      select: { ...OWN_PROFILE_SELECT, terms_version: true },
    })
    if (!user) throw new NotFoundException('Usuario no encontrado')
    const { terms_version, ...perfil } = user
    return {
      ...perfil,
      // isAdmin: el frontend muestra el botón del panel. Igual el backend lo vuelve a controlar en /admin.
      isAdmin: isAdminEmail(user.email, parseAdminEmails(this.config.get<string>('ADMIN_EMAILS'))),
      // Nunca aceptó (usuarios de antes, o que entraron con Google) o aceptó una versión vieja: la app le pide aceptar
      terminosPendientes: terminosPendientes(terms_version),
      // La versión que hay que aceptar (el frontend la manda tal cual a POST /users/me/aceptar-terminos)
      terminosVersion: TERMS_VERSION,
    }
  }

  // El usuario del token acepta los Términos y la Política de privacidad. Sólo vale la versión vigente (si la app
  // le mostró una vieja, que recargue). La fecha la pone el servidor.
  async aceptarTerminos(id: string, version: string) {
    if (version !== TERMS_VERSION) throw new BadRequestException(MENSAJE_VERSION_TERMINOS)
    const user = await this.prisma.users.update({
      where: { id },
      data: { terms_accepted_at: new Date(), terms_version: TERMS_VERSION },
      select: { terms_accepted_at: true, terms_version: true },
    })
    return { terminosPendientes: false, version: user.terms_version, aceptadoEn: user.terms_accepted_at }
  }

  async update(id: string, data: UpdateProfileDto) {
    // Nombre de usuario, nombre y apellido van en users; el resto, en profiles
    const { username, first_name, last_name, ...profileFields } = data

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
          ...(first_name ? { first_name } : {}),
          ...(last_name ? { last_name } : {}),
          profile: {
            upsert: {
              create: profileFields,
              update: profileFields,
            },
          },
        },
        select: OWN_PROFILE_SELECT,
      })
    } catch (e) {
      // Dos usuarios eligiendo el mismo nombre a la vez: la base frena el segundo
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Nombre de usuario ya en uso')
      }
      throw e
    }
  }

  // Borrar la cuenta del usuario del token, para siempre. Confirma con la contraseña o, si entró sólo con Google (no
  // tiene contraseña), con su nombre de usuario. Nunca se loguea lo que mandó.
  // Primero lo saca de las salas y la cola (y corta sus conexiones), así no queda en los resultados de una partida en
  // curso; después borra todo lo suyo en UNA transacción. Las partidas multijugador son de todos: quedan, sin él (los
  // demás no pierden sus resultados ni sus puntos). Su email y su nombre de usuario quedan libres.
  async borrarCuenta(id: string, body: BorrarCuentaDto) {
    const user = await this.prisma.users.findUnique({ where: { id }, select: { id: true, username: true, password_hash: true } })
    if (!user) throw new UnauthorizedException()
    if (user.password_hash) {
      if (!body.password) throw new BadRequestException(MENSAJE_FALTA_CONTRASENA)
      if (!(await bcrypt.compare(body.password, user.password_hash))) throw new UnauthorizedException(MENSAJE_CONTRASENA_INCORRECTA)
    } else if ((body.confirmacion ?? '').trim().toLowerCase() !== user.username.toLowerCase()) {
      throw new BadRequestException(MENSAJE_USUARIO_NO_COINCIDE)
    }

    await this.multiplayer.expulsarUsuario(id)

    // En orden, de lo que depende de otras cosas a users. Casi todo tiene onDelete: Cascade desde users, pero se borra
    // explícito igual (si mañana una relación cambia, esto sigue borrando todo). La excepción son sus partidas solo:
    // matches.user_id es SetNull, así que sin esto quedarían huérfanas.
    await this.prisma.$transaction([
      this.prisma.daily_challenges.deleteMany({ where: { user_id: id } }),
      this.prisma.match_results.deleteMany({ where: { user_id: id } }),
      // Partidas solo (vs. IA, ahorcado, trivia, sopa, memotest, desafío), con sus rondas y respuestas (Cascade)
      this.prisma.matches.deleteMany({ where: { user_id: id, room_id: null } }),
      this.prisma.votes.deleteMany({ where: { user_id: id } }),
      // Sus respuestas en partidas multijugador (las de los demás quedan)
      this.prisma.answers.deleteMany({ where: { room_player: { user_id: id } } }),
      this.prisma.room_players.deleteMany({ where: { user_id: id } }),
      this.prisma.user_achievements.deleteMany({ where: { user_id: id } }),
      this.prisma.game_stats.deleteMany({ where: { user_id: id } }),
      this.prisma.contenido_visto.deleteMany({ where: { user_id: id } }),
      this.prisma.password_resets.deleteMany({ where: { user_id: id } }),
      this.prisma.profiles.deleteMany({ where: { user_id: id } }),
      this.prisma.users.delete({ where: { id } }),
    ])
    return { borrada: true }
  }
}