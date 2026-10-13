import { NotFoundException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AdminGuard } from './admin.guard';
import { AdminController } from './admin.controller';
import { isAdminEmail, parseAdminEmails } from './admin-access';

describe('acceso al panel de administración', () => {
  const env: Record<string, string | undefined> = {};
  const config = { get: (k: string) => env[k] };
  const prisma = { users: { findUnique: jest.fn() } };
  const guard = new AdminGuard(prisma as never, config as never);
  const ctx = (user?: { userId: string }) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user, method: 'GET', originalUrl: '/admin/usuarios' }) }) }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    env.ADMIN_EMAILS = 'camila@mail.com, Augusto@Mail.com';
    prisma.users.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      ({ cami: { email: 'Camila@mail.com' }, augu: { email: 'augusto@mail.com' }, otro: { email: 'otro@mail.com' }, sinmail: { email: null } })[where.id] ?? null,
    );
  });

  it('sin sesión: 401', async () => {
    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logueado pero no admin: 404 igual al de una ruta que no existe', async () => {
    for (const id of ['otro', 'sinmail', 'borrado']) {
      const err = await guard.canActivate(ctx({ userId: id })).catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect(err.getResponse()).toEqual({ statusCode: 404, message: 'Cannot GET /admin/usuarios', error: 'Not Found' });
    }
  });

  it('admin (email en ADMIN_EMAILS, sin distinguir mayúsculas): pasa', async () => {
    await expect(guard.canActivate(ctx({ userId: 'cami' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx({ userId: 'augu' }))).resolves.toBe(true);
    // El email se busca en la base (no se usa el del token)
    expect(prisma.users.findUnique).toHaveBeenCalledWith({ where: { id: 'augu' }, select: { email: true } });
  });

  it('sin la variable (o vacía), nadie es admin', async () => {
    for (const valor of [undefined, '', ' , ']) {
      env.ADMIN_EMAILS = valor;
      await expect(guard.canActivate(ctx({ userId: 'cami' }))).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('parseo de ADMIN_EMAILS', () => {
    const admins = parseAdminEmails(' A@b.com,,c@D.com ');
    expect([...admins]).toEqual(['a@b.com', 'c@d.com']);
    expect(isAdminEmail('C@d.com', admins)).toBe(true);
    expect(isAdminEmail(null, admins)).toBe(false);
    expect(isAdminEmail('x@y.com', admins)).toBe(false);
  });

  it('el controller usa límite → sesión → admin, con 30 pedidos por minuto, y sólo GET', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminController) as unknown[];
    expect(guards[0]).toBe(ThrottlerGuard);
    expect(guards[2]).toBe(AdminGuard);
    expect(guards).toHaveLength(3);
    const limite = Reflect.getMetadata('THROTTLER:LIMITdefault', AdminController);
    expect(limite).toBe(30);
    const metodos = Object.getOwnPropertyNames(AdminController.prototype).filter((m) => m !== 'constructor');
    for (const m of metodos) {
      expect([m, Reflect.getMetadata('method', AdminController.prototype[m as keyof AdminController])]).toEqual([m, 0]); // 0 = GET
    }
  });
});
