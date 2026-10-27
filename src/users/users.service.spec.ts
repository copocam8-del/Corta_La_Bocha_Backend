import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { TERMS_VERSION } from '../legal/terminos';
import { MultiplayerService } from '../rooms/multiplayer.service';

describe('UsersService', () => {
  let service: UsersService;
  // Las tablas que borra DELETE /users/me (todas con deleteMany, users con delete)
  const TABLAS = ['daily_challenges', 'match_results', 'matches', 'votes', 'answers', 'room_players', 'user_achievements', 'game_stats', 'contenido_visto', 'password_resets', 'profiles'] as const;
  const prisma = {
    users: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn((a: unknown) => ({ tabla: 'users', ...(a as object) })) },
    ...Object.fromEntries(TABLAS.map((t) => [t, { deleteMany: jest.fn((a: unknown) => ({ tabla: t, ...(a as object) })) }])),
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  } as Record<string, any>;
  const multiplayer = { expulsarUsuario: jest.fn(async () => undefined) };
  const env: Record<string, string | undefined> = {};
  const config = { get: (k: string) => env[k] };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }, { provide: ConfigService, useValue: config }, { provide: MultiplayerService, useValue: multiplayer }],
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

  describe('Borrar la cuenta (DELETE /users/me)', () => {
    const HASH = bcrypt.hashSync('gambeta-de-potrero', 4);
    const conContrasena = { id: 'u1', username: 'Cami10', password_hash: HASH };
    const deGoogle = { id: 'u1', username: 'Cami10', password_hash: null };
    const borradas = () => (prisma.$transaction.mock.calls[0]?.[0] ?? []) as { tabla: string; where: object }[];

    it('con la contraseña correcta: primero lo saca de las salas y después borra todo lo suyo en UNA transacción, users al final', async () => {
      prisma.users.findUnique.mockResolvedValue(conContrasena);
      expect(await service.borrarCuenta('u1', { password: 'gambeta-de-potrero' })).toEqual({ borrada: true });
      expect(multiplayer.expulsarUsuario).toHaveBeenCalledWith('u1');
      expect(multiplayer.expulsarUsuario.mock.invocationCallOrder[0]).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0]);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const ops = borradas();
      expect(ops.map((o) => o.tabla)).toEqual([...TABLAS, 'users']);
      expect(ops.at(-1)).toEqual({ tabla: 'users', where: { id: 'u1' } });
      // Sólo sus filas; de las partidas, sólo las solo (las multijugador son de todos)
      expect(ops.find((o) => o.tabla === 'matches')!.where).toEqual({ user_id: 'u1', room_id: null });
      expect(ops.find((o) => o.tabla === 'answers')!.where).toEqual({ room_player: { user_id: 'u1' } });
      for (const o of ops.filter((x) => !['users', 'answers'].includes(x.tabla))) expect(o.where).toMatchObject({ user_id: 'u1' });
    });

    it('contraseña equivocada → 401 "La contraseña no es correcta." y no toca nada (ni las salas)', async () => {
      prisma.users.findUnique.mockResolvedValue(conContrasena);
      const error = await service.borrarCuenta('u1', { password: 'otra' }).catch((e) => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toBe('La contraseña no es correcta.');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(multiplayer.expulsarUsuario).not.toHaveBeenCalled();
    });

    it('con contraseña, sin mandarla (o mandando el nombre de usuario) → 400 y no borra', async () => {
      prisma.users.findUnique.mockResolvedValue(conContrasena);
      await expect(service.borrarCuenta('u1', {})).rejects.toThrow(BadRequestException);
      await expect(service.borrarCuenta('u1', { confirmacion: 'Cami10' })).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('cuenta de Google (sin contraseña): confirma con su nombre de usuario, sin importar mayúsculas', async () => {
      prisma.users.findUnique.mockResolvedValue(deGoogle);
      expect(await service.borrarCuenta('u1', { confirmacion: '  cAMI10 ' })).toEqual({ borrada: true });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('cuenta de Google con otro nombre, vacío o una contraseña cualquiera → 400 y no borra', async () => {
      prisma.users.findUnique.mockResolvedValue(deGoogle);
      for (const body of [{ confirmacion: 'Cami1' }, { confirmacion: '' }, {}, { password: 'lo-que-sea' }]) {
        await expect(service.borrarCuenta('u1', body)).rejects.toThrow(BadRequestException);
      }
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(multiplayer.expulsarUsuario).not.toHaveBeenCalled();
    });

    it('si el usuario ya no existe → 401 (nunca 500)', async () => {
      prisma.users.findUnique.mockResolvedValue(null);
      await expect(service.borrarCuenta('u1', { password: 'x' })).rejects.toThrow(UnauthorizedException);
    });
  });
});
