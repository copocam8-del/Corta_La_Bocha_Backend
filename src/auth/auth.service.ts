import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(data: { username: string; email: string; password: string }) {
    const exists = await this.prisma.users.findUnique({ where: { email: data.email } });
    if (exists) throw new ConflictException('Email ya registrado');

    const hashed = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.users.create({
      data: {
        username: data.username,
        email: data.email,
        password_hash: hashed,
      },
    });

    return { message: 'Usuario creado', userId: user.id };
  }

  async login(data: { email: string; password: string }) {
    const user = await this.prisma.users.findUnique({ where: { email: data.email } });
    if (!user || !user.password_hash) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(data.password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    const token = this.jwt.sign({ sub: user.id, email: user.email });
    return { access_token: token };
  }
} 