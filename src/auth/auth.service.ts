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

    while (await this.prisma.user.findUnique({ where: { username: candidate } })) {
      suffix += 1;
      candidate = `${slug}${suffix}`;
    }

    return candidate;
  }

  async register(data: { name: string; email: string; password: string; username?: string }) {
    const existingEmail = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existingEmail) throw new ConflictException('Email ya registrado');

    let username = data.username;
    if (username) {
      const existingUsername = await this.prisma.user.findUnique({ where: { username } });
      if (existingUsername) throw new ConflictException('Nombre de usuario ya en uso');
    } else {
      username = await this.generateUniqueUsername(data.name);
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: { name: data.name, username, email: data.email, password: hashed },
    });

    return { message: 'Usuario creado', userId: user.id, username: user.username };
  }

  async login(data: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !user.password) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    const token = this.jwt.sign({ sub: user.id, email: user.email, username: user.username });
    return { access_token: token };
  }
} 