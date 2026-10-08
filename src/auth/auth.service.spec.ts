import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

// bcrypt real, pero con compare "espiable" para comprobar que siempre se llama
jest.mock('bcrypt', () => {
  const real = jest.requireActual('bcrypt');
  return { ...real, compare: jest.fn((pass: string, hash: string) => real.compare(pass, hash)) };
});

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    users: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const jwt = { sign: jest.fn().mockReturnValue('token-falso') };

  const registro = {
    username: 'messi_10',
    birthDate: '2000-06-24',
    email: '  Leo@Mail.COM ',
    password: 'contraseña123',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('guarda el email en minúsculas y sin espacios', async () => {
      prisma.users.findFirst.mockResolvedValue(null);
      prisma.users.findUnique.mockResolvedValue(null);
      prisma.users.create.mockResolvedValue({ id: 'u1', username: 'messi_10' });

      await service.register(registro);

      expect(prisma.users.findFirst).toHaveBeenCalledWith({
        where: { email: { equals: 'leo@mail.com', mode: 'insensitive' } },
      });
      expect(prisma.users.create.mock.calls[0][0].data.email).toBe('leo@mail.com');
    });

    it('devuelve 409 si el email ya existe', async () => {
      prisma.users.findFirst.mockResolvedValue({ id: 'otro' });
      await expect(service.register(registro)).rejects.toThrow(ConflictException);
    });

    it('convierte el error P2002 de Prisma (registro simultáneo) en 409', async () => {
      prisma.users.findFirst.mockResolvedValue(null);
      prisma.users.findUnique.mockResolvedValue(null);
      prisma.users.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['username'] },
        }),
      );

      await expect(service.register(registro)).rejects.toThrow(
        new ConflictException('Nombre de usuario ya en uso'),
      );
    });

    it('rechaza un usuario que sólo difiere en mayúsculas de uno existente', async () => {
      prisma.users.findFirst
        .mockResolvedValueOnce(null) // email libre
        .mockResolvedValueOnce({ id: 'otro' }); // "MESSI_10" ya existe como "messi_10"

      await expect(service.register({ ...registro, username: 'MESSI_10' })).rejects.toThrow(
        new ConflictException('Nombre de usuario ya en uso'),
      );
      expect(prisma.users.findFirst).toHaveBeenLastCalledWith({
        where: { username: { equals: 'MESSI_10', mode: 'insensitive' } },
        select: { id: true },
      });
    });

    it('sin usuario genera uno de al menos 3 caracteres a partir del nombre', async () => {
      prisma.users.findFirst.mockResolvedValue(null);
      prisma.users.create.mockResolvedValue({ id: 'u1', username: 'x' });

      await service.register({ ...registro, username: undefined, name: 'Al' });

      expect(prisma.users.create.mock.calls[0][0].data.username).toBe('jugadoral');
    });

    it('si el usuario generado ya existe le agrega un número', async () => {
      prisma.users.findFirst
        .mockResolvedValueOnce(null) // email libre
        .mockResolvedValueOnce({ id: 'otro' }) // "lionel" ocupado
        .mockResolvedValueOnce(null); // "lionel1" libre
      prisma.users.create.mockResolvedValue({ id: 'u1', username: 'x' });

      await service.register({ ...registro, username: undefined, name: 'Lionel' });

      expect(prisma.users.create.mock.calls[0][0].data.username).toBe('lionel1');
    });

    it('no oculta otros errores de la base', async () => {
      prisma.users.findFirst.mockResolvedValue(null);
      prisma.users.findUnique.mockResolvedValue(null);
      prisma.users.create.mockRejectedValue(new Error('se cayó la base'));

      await expect(service.register(registro)).rejects.toThrow('se cayó la base');
    });
  });

  describe('login', () => {
    it('encuentra al usuario aunque el email venga con mayúsculas', async () => {
      const password_hash = await bcrypt.hash('contraseña123', 4);
      prisma.users.findFirst.mockResolvedValue({ id: 'u1', email: 'leo@mail.com', username: 'messi_10', password_hash });

      const res = await service.login({ email: 'LEO@mail.com', password: 'contraseña123' });

      expect(prisma.users.findFirst).toHaveBeenCalledWith({
        where: { email: { equals: 'leo@mail.com', mode: 'insensitive' } },
      });
      expect(res.access_token).toBe('token-falso');
    });

    it('con un email inexistente igual compara la contraseña (mismo tiempo de respuesta) y da 401', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(service.login({ email: 'nadie@mail.com', password: 'loquesea' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    });

    it('rechaza una contraseña incorrecta con 401', async () => {
      const password_hash = await bcrypt.hash('contraseña123', 4);
      prisma.users.findFirst.mockResolvedValue({ id: 'u1', password_hash });

      await expect(service.login({ email: 'leo@mail.com', password: 'otra' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
