import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private async generateUniqueUsername(base: string) {
    const slug = base
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // saca acentos
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20) || 'jugador';

    let candidate = slug;
    let suffix = 0;

    while (await this.prisma.users.findUnique({ where: { username: candidate } })) {
      suffix += 1;
      candidate = `${slug}${suffix}`;
    }

    return candidate;
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
    const existingEmail = await this.prisma.users.findUnique({ where: { email: data.email } });
    if (existingEmail) throw new ConflictException('Email ya registrado');

    let username = data.username;
    if (username) {
      const existingUsername = await this.prisma.users.findUnique({ where: { username } });
      if (existingUsername) throw new ConflictException('Nombre de usuario ya en uso');
    } else {
      username = await this.generateUniqueUsername(data.name || data.email.split('@')[0]);
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.users.create({
      data: {
        username,
        first_name: data.name,
        last_name: data.lastName,
        birth_date: data.birthDate ? new Date(data.birthDate) : undefined,
        country: data.country,
        email: data.email,
        password_hash: hashed,
        profile: { create: {} },
      },
    });

    return { message: 'Usuario creado', userId: user.id, username: user.username };
  }

 async login(data: { email: string; password: string }) {
    const user = await this.prisma.users.findUnique({ where: { email: data.email } });
    if (!user || !user.password_hash) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(data.password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    const token = this.jwt.sign({ sub: user.id, email: user.email, username: user.username });
    return {
      access_token: token,
      username: user.username,
      name: user.first_name,
    };
  }
}