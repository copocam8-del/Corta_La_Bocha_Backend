import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { TERMS_VERSION } from '../legal/terminos';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = { users: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() } };
  const env: Record<string, string | undefined> = {};
  const config = { get: (k: string) => env[k] };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }, { provide: ConfigService, useValue: config }],
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

  describe('isAdmin en /users/me', () => {
    beforeEach(() => prisma.users.findUnique.mockResolvedValue({ id: 'u1', email: 'Cami@Mail.com' }));
    afterEach(() => delete env.ADMIN_EMAILS);

    it('true si su email está en ADMIN_EMAILS (sin distinguir mayúsculas ni espacios)', async () => {
      env.ADMIN_EMAILS = 'otro@mail.com, cami@mail.com ';
      expect(await service.findOwn('u1')).toMatchObject({ isAdmin: true });
    });

    it('false si no está o si no hay variable', async () => {
      env.ADMIN_EMAILS = 'otro@mail.com';
      expect(await service.findOwn('u1')).toMatchObject({ isAdmin: false });
      delete env.ADMIN_EMAILS;
      expect(await service.findOwn('u1')).toMatchObject({ isAdmin: false });
    });
  });

  describe('Términos y Política de privacidad', () => {
    it('/users/me dice terminosPendientes si nunca aceptó o aceptó una versión vieja (y no manda la columna cruda)', async () => {
      for (const [version, pendientes] of [[null, true], ['2026-01-01', true], [TERMS_VERSION, false]] as const) {
        prisma.users.findUnique.mockResolvedValue({ id: 'u1', email: 'a@mail.com', terms_version: version });
        const yo = await service.findOwn('u1');
        expect(yo).toMatchObject({ terminosPendientes: pendientes, terminosVersion: TERMS_VERSION });
        expect(yo).not.toHaveProperty('terms_version');
      }
    });

    it('aceptar guarda la fecha del servidor y la versión vigente, sólo para ese usuario', async () => {
      prisma.users.update.mockResolvedValue({ terms_accepted_at: new Date(), terms_version: TERMS_VERSION });
      const res = await service.aceptarTerminos('u1', TERMS_VERSION);
      const arg = prisma.users.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'u1' });
      expect(arg.data.terms_version).toBe(TERMS_VERSION);
      expect(arg.data.terms_accepted_at).toBeInstanceOf(Date);
      expect(res).toMatchObject({ terminosPendientes: false, version: TERMS_VERSION });
    });

    it('una versión que no es la vigente → 400 y no guarda nada', async () => {
      await expect(service.aceptarTerminos('u1', '2020-01-01')).rejects.toThrow(BadRequestException);
      expect(prisma.users.update).not.toHaveBeenCalled();
    });
  });
});
