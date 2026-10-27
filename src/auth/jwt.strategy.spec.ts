import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import type { PrismaService } from '../prisma/prisma.service';

describe('JwtStrategy', () => {
  const ID = '11111111-2222-4333-8444-555555555555';
  const prisma = { users: { findUnique: jest.fn() } };
  const config = new ConfigService({ JWT_SECRET: 'secreto-de-prueba-bien-largo-para-el-test-123456' });
  const strategy = new JwtStrategy(config, prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('si el usuario existe, el pedido sigue con su id (del token)', async () => {
    prisma.users.findUnique.mockResolvedValue({ id: ID });
    expect(await strategy.validate({ sub: ID, email: 'a@mail.com' })).toEqual({ userId: ID, email: 'a@mail.com' });
    expect(prisma.users.findUnique).toHaveBeenCalledWith({ where: { id: ID }, select: { id: true } });
  });

  it('si borró su cuenta (ya no existe), su token deja de servir: 401', async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: ID })).rejects.toThrow(UnauthorizedException);
  });

  it('un "sub" raro → 401 sin consultar la base (nunca 500)', async () => {
    for (const sub of [undefined, 123, 'no-es-un-uuid', { id: ID }]) {
      await expect(strategy.validate({ sub })).rejects.toThrow(UnauthorizedException);
    }
    await expect(strategy.validate(null)).rejects.toThrow(UnauthorizedException);
    expect(prisma.users.findUnique).not.toHaveBeenCalled();
  });
});
