import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = { users: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  const camposPrivados = ['email', 'birth_date', 'first_name', 'last_name', 'password_hash'];

  it('el listado de usuarios no pide datos privados', async () => {
    prisma.users.findMany.mockResolvedValue([]);
    await service.findAll();
    const select = prisma.users.findMany.mock.calls[0][0].select;
    for (const campo of camposPrivados) expect(select).not.toHaveProperty(campo);
    expect(select).toHaveProperty('username', true);
  });

  it('el perfil de otro usuario no pide datos privados', async () => {
    prisma.users.findUnique.mockResolvedValue({ id: 'u2' });
    await service.findPublic('u2');
    const select = prisma.users.findUnique.mock.calls[0][0].select;
    for (const campo of camposPrivados) expect(select).not.toHaveProperty(campo);
  });

  it('el perfil propio sí incluye email y fecha de nacimiento (pero nunca la contraseña)', async () => {
    prisma.users.findUnique.mockResolvedValue({ id: 'u1' });
    await service.findOwn('u1');
    const select = prisma.users.findUnique.mock.calls[0][0].select;
    expect(select).toMatchObject({ email: true, birth_date: true, first_name: true, last_name: true });
    expect(select).not.toHaveProperty('password_hash');
  });

  it('PUT /users/me guarda nombre y apellido en users (no en el perfil) y devuelve el perfil propio', async () => {
    prisma.users.update.mockResolvedValue({ id: 'u1', first_name: 'Lionel', last_name: 'Messi' });
    const res = await service.update('u1', { first_name: 'Lionel', last_name: 'Messi', bio: 'Hincha' });
    const arg = prisma.users.update.mock.calls[0][0];
    expect(arg.data).toMatchObject({ first_name: 'Lionel', last_name: 'Messi' });
    expect(arg.data.profile.upsert.update).toEqual({ bio: 'Hincha' });
    expect(arg.data.profile.upsert.update).not.toHaveProperty('first_name');
    expect(arg.select).toMatchObject({ first_name: true, last_name: true });
    expect(res).toMatchObject({ first_name: 'Lionel', last_name: 'Messi' });
  });

  it('si no vienen nombre ni apellido, no los toca', async () => {
    prisma.users.update.mockResolvedValue({ id: 'u1' });
    await service.update('u1', { bio: 'Hola' });
    const data = prisma.users.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('first_name');
    expect(data).not.toHaveProperty('last_name');
  });

  it('devuelve 404 si el usuario no existe', async () => {
    prisma.users.findUnique.mockResolvedValue(null);
    await expect(service.findPublic('no-existe')).rejects.toThrow(NotFoundException);
  });
});
