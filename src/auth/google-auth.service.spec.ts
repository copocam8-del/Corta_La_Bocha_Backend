import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { GoogleAuthService } from './google-auth.service';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

// Simulamos la verificación de Google (no hay red en los tests)
const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

const tokenDeGoogle = (payload: object) => ({ getPayload: () => payload });

describe('GoogleAuthService', () => {
  const prisma = {
    users: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  };
  const auth = {
    issueSession: jest.fn((u: { username: string }) => ({ access_token: 'jwt', username: u.username })),
    generateUniqueUsername: jest.fn().mockResolvedValue('lionel'),
  };

  async function crear(clientId?: string) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAuthService,
        { provide: ConfigService, useValue: new ConfigService(clientId ? { GOOGLE_CLIENT_ID: clientId } : {}) },
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    return module.get(GoogleAuthService);
  }

  const googleVerificado = { sub: 'g-123', email: 'Leo@Gmail.com', email_verified: true, given_name: 'Lionel', family_name: 'Messi' };

  beforeEach(() => jest.clearAllMocks());

  it('sin GOOGLE_CLIENT_ID responde 503 y no llama a Google', async () => {
    const service = await crear();
    await expect(service.login('cualquier-cosa')).rejects.toThrow(ServiceUnavailableException);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('verifica que el token sea para nuestra app (audience)', async () => {
    const service = await crear('mi-client-id');
    verifyIdToken.mockResolvedValue(tokenDeGoogle(googleVerificado));
    prisma.users.findUnique.mockResolvedValue({ id: 'u1', username: 'leo' });

    await service.login('token');

    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'token', audience: 'mi-client-id' });
  });

  it('un token inválido da 401', async () => {
    const service = await crear('mi-client-id');
    verifyIdToken.mockRejectedValue(new Error('Wrong recipient'));
    await expect(service.login('token-falso')).rejects.toThrow(UnauthorizedException);
  });

  it('si la cuenta de Google ya está vinculada, entra con ese usuario', async () => {
    const service = await crear('mi-client-id');
    verifyIdToken.mockResolvedValue(tokenDeGoogle(googleVerificado));
    prisma.users.findUnique.mockResolvedValue({ id: 'u1', username: 'leo' });

    await expect(service.login('token')).resolves.toEqual({ access_token: 'jwt', username: 'leo' });
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('con email verificado, une la cuenta existente que tiene ese email', async () => {
    const service = await crear('mi-client-id');
    verifyIdToken.mockResolvedValue(tokenDeGoogle(googleVerificado));
    prisma.users.findUnique.mockResolvedValue(null);
    prisma.users.findFirst.mockResolvedValue({ id: 'u1', username: 'leo', google_id: null });
    prisma.users.update.mockResolvedValue({ id: 'u1', username: 'leo' });

    await service.login('token');

    expect(prisma.users.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'leo@gmail.com', mode: 'insensitive' } },
    });
    expect(prisma.users.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { google_id: 'g-123' } });
  });

  it('con email NO verificado no une ni crea cuentas', async () => {
    const service = await crear('mi-client-id');
    verifyIdToken.mockResolvedValue(tokenDeGoogle({ ...googleVerificado, email_verified: false }));
    prisma.users.findUnique.mockResolvedValue(null);

    await expect(service.login('token')).rejects.toThrow(BadRequestException);
    expect(prisma.users.findFirst).not.toHaveBeenCalled();
    expect(prisma.users.update).not.toHaveBeenCalled();
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('si el email ya está vinculado a OTRA cuenta de Google, da 409', async () => {
    const service = await crear('mi-client-id');
    verifyIdToken.mockResolvedValue(tokenDeGoogle(googleVerificado));
    prisma.users.findUnique.mockResolvedValue(null);
    prisma.users.findFirst.mockResolvedValue({ id: 'u1', google_id: 'g-otro' });

    await expect(service.login('token')).rejects.toThrow(ConflictException);
  });

  it('si no existe, crea el usuario con datos de Google, sin contraseña y con email en minúsculas', async () => {
    const service = await crear('mi-client-id');
    verifyIdToken.mockResolvedValue(tokenDeGoogle(googleVerificado));
    prisma.users.findUnique.mockResolvedValue(null);
    prisma.users.findFirst.mockResolvedValue(null);
    prisma.users.create.mockResolvedValue({ id: 'u2', username: 'lionel' });

    await service.login('token');

    expect(auth.generateUniqueUsername).toHaveBeenCalledWith('Lionel');
    expect(prisma.users.create.mock.calls[0][0].data).toMatchObject({
      username: 'lionel', email: 'leo@gmail.com', google_id: 'g-123',
      first_name: 'Lionel', last_name: 'Messi', password_hash: null,
    });
  });

  it('si dos pedidos crean la misma cuenta a la vez, el segundo usa la que creó el primero', async () => {
    const service = await crear('mi-client-id');
    verifyIdToken.mockResolvedValue(tokenDeGoogle(googleVerificado));
    prisma.users.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'u2', username: 'lionel' });
    prisma.users.findFirst.mockResolvedValue(null);
    prisma.users.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(service.login('token')).resolves.toEqual({ access_token: 'jwt', username: 'lionel' });
  });
});
