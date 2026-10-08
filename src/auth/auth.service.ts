import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Hash de una contraseña que nadie conoce. Si el email no existe igual comparamos contra
// esto, así el login tarda lo mismo y no se puede adivinar qué emails están registrados.
const DUMMY_HASH = bcrypt.hashSync('usuario-inexistente-' + Math.random(), 10);

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private async generateUniqueUsername(base: string) {
    let slug = base
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // saca acentos
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20);
    // Un nombre corto como "Al" daría un usuario de menos de 3 caracteres
    if (slug.length < 3) slug = `jugador${slug}`;

    let candidate = slug;
    let suffix = 0;

    while (await this.findByUsername(candidate)) {
      suffix += 1;
      candidate = `${slug}${suffix}`;
    }

    return candidate;
  }

  // "Messi" y "messi" cuentan como el mismo nombre de usuario
  private findByUsername(username: string) {
    return this.prisma.users.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  // Busca por email sin distinguir mayúsculas: hay cuentas viejas guardadas con mayúsculas
  private findByEmail(email: string) {
    return this.prisma.users.findFirst({
      where: { email: { equals: normalizeEmail(email), mode: 'insensitive' } },
    });
  }

  async register(data: {
    username?: string
    name?: string
    lastName?: string
    birthDate?: string
    country?: string
    email: string
    password: string
  }) {
    const email = normalizeEmail(data.email);

    const existingEmail = await this.findByEmail(email);
    if (existingEmail) throw new ConflictException('Email ya registrado');

    let username = data.username;
    if (username) {
      const existingUsername = await this.findByUsername(username);
      if (existingUsername) throw new ConflictException('Nombre de usuario ya en uso');
    } else {
      username = await this.generateUniqueUsername(data.name || email.split('@')[0]);
    }

    const hashed = await bcrypt.hash(data.password, 10);
    try {
      const user = await this.prisma.users.create({
        data: {
          username,
          first_name: data.name,
          last_name: data.lastName,
          birth_date: data.birthDate ? new Date(data.birthDate) : undefined,
          country: data.country,
          email,
          password_hash: hashed,
          profile: { create: {} },
        },
      });

      return { message: 'Usuario creado', userId: user.id, username: user.username };
    } catch (e) {
      // Dos registros simultáneos pueden pasar los chequeos de arriba; la base frena el segundo con P2002
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = JSON.stringify(e.meta?.target ?? '');
        throw new ConflictException(
          target.includes('username') ? 'Nombre de usuario ya en uso' : 'Email ya registrado',
        );
      }
      throw e;
    }
  }

  async login(data: { email: string; password: string }) {
    const user = await this.findByEmail(data.email);
    // Siempre comparamos (aunque el usuario no exista) para que la respuesta tarde lo mismo
    const valid = await bcrypt.compare(data.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !user.password_hash || !valid) throw new UnauthorizedException('Credenciales inválidas');

    const token = this.jwt.sign({ sub: user.id, email: user.email, username: user.username });
    return {
      access_token: token,
      username: user.username,
      name: user.first_name,
    };
  }
}
