import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { FORGOT_MESSAGE, hashToken, INVALID_TOKEN_MESSAGE, PasswordResetService, RESET_TTL_MS } from './password-reset.service';
import { MailService } from '../mail/mail.service';
import { authValidationPipe } from './auth-validation.pipe';
import { ResetPasswordDto } from './dto/password-reset.dto';

const espera = () => new Promise((r) => setTimeout(r, 0));

describe('PasswordResetService', () => {
  const prisma = {
    users: { findFirst: jest.fn(), update: jest.fn() },
    password_resets: { updateMany: jest.fn(), create: jest.fn((x: unknown) => x), findUnique: jest.fn() },
    $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]))),
  };
  const mail = { send: jest.fn() };
  const crear = (env: Record<string, string> = {}) =>
    new PasswordResetService(prisma as never, mail as never, new ConfigService({ FRONTEND_URL: 'https://juego.test/', ...env }));
  const NOW = Date.parse('2026-10-12T12:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.password_resets.updateMany.mockResolvedValue({ count: 1 });
  });

  it('responde lo mismo exista o no la cuenta', async () => {
    prisma.users.findFirst.mockResolvedValueOnce(null);
    expect(await crear().forgot('nadie@x.com', NOW)).toEqual({ message: FORGOT_MESSAGE });
    await espera();
    expect(mail.send).not.toHaveBeenCalled();

    prisma.users.findFirst.mockResolvedValueOnce({ id: 'u1', username: 'ana', email: 'ana@x.com' });
    mail.send.mockResolvedValue(true);
    expect(await crear().forgot('ana@x.com', NOW)).toEqual({ message: FORGOT_MESSAGE });
    await espera(); await espera();
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('guarda sólo el hash del token, vence en 1 hora y manda el link con el token', async () => {
    prisma.users.findFirst.mockResolvedValue({ id: 'u1', username: 'ana', email: 'ana@x.com' });
    mail.send.mockResolvedValue(true);
    await crear().forgot('ana@x.com', NOW);
    await espera(); await espera();
    const data = prisma.password_resets.create.mock.calls[0][0].data as { token_hash: string; expires_at: Date };
    const texto = mail.send.mock.calls[0][0].text as string;
    const token = /token=([A-Za-z0-9_-]+)/.exec(texto)![1];
    expect(texto).toContain('https://juego.test/restablecer-contrasena?token=');
    expect(data.token_hash).toBe(hashToken(token));
    expect(data.token_hash).not.toContain(token);
    expect(data.expires_at.getTime()).toBe(NOW + RESET_TTL_MS);
    // Los pedidos anteriores quedan anulados
    expect(prisma.password_resets.updateMany).toHaveBeenCalledWith({ where: { user_id: 'u1', used_at: null }, data: expect.anything() });
  });

  it('cambia la contraseña con un token válido (una sola vez)', async () => {
    prisma.password_resets.findUnique.mockResolvedValue({ id: 'r1', user_id: 'u1', used_at: null, expires_at: new Date(NOW + 1000) });
    await expect(crear().reset('tok', 'nueva-clave-123', NOW)).resolves.toMatchObject({ message: expect.stringContaining('Listo') });
    expect(prisma.password_resets.findUnique).toHaveBeenCalledWith({ where: { token_hash: hashToken('tok') } });
    const hash = prisma.users.update.mock.calls[0][0].data.password_hash as string;
    expect(await bcrypt.compare('nueva-clave-123', hash)).toBe(true);

    // Dos pedidos a la vez con el mismo token: el segundo no pasa
    prisma.password_resets.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(crear().reset('tok', 'otra-clave-123', NOW)).rejects.toThrow(INVALID_TOKEN_MESSAGE);
  });

  it('rechaza tokens vencidos, usados o inexistentes', async () => {
    prisma.password_resets.findUnique.mockResolvedValueOnce({ id: 'r1', user_id: 'u1', used_at: null, expires_at: new Date(NOW - 1) });
    await expect(crear().reset('tok', 'nueva-clave-123', NOW)).rejects.toThrow(BadRequestException);
    prisma.password_resets.findUnique.mockResolvedValueOnce({ id: 'r1', user_id: 'u1', used_at: new Date(NOW - 5), expires_at: new Date(NOW + 1000) });
    await expect(crear().reset('tok', 'nueva-clave-123', NOW)).rejects.toThrow(BadRequestException);
    prisma.password_resets.findUnique.mockResolvedValueOnce(null);
    await expect(crear().reset('tok', 'nueva-clave-123', NOW)).rejects.toThrow(BadRequestException);
    expect(prisma.users.update).not.toHaveBeenCalled();
  });

  it('la contraseña nueva cumple las mismas reglas que el registro', async () => {
    await expect(authValidationPipe.transform({ token: 't', password: 'corta' }, { type: 'body', metatype: ResetPasswordDto }))
      .rejects.toThrow(BadRequestException);
    await expect(authValidationPipe.transform({ token: 't', password: 'larga-y-buena' }, { type: 'body', metatype: ResetPasswordDto }))
      .resolves.toBeDefined();
  });

  it('fuera de producción y sin mail configurado, muestra el link en la consola', async () => {
    prisma.users.findFirst.mockResolvedValue({ id: 'u1', username: 'ana', email: 'ana@x.com' });
    mail.send.mockResolvedValue(false);
    const log = jest.spyOn((crear() as unknown as { logger: { log: () => void } }).logger.constructor.prototype, 'log').mockImplementation(() => undefined);
    await crear({ NODE_ENV: 'development' }).forgot('ana@x.com', NOW);
    await espera(); await espera();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('restablecer-contrasena?token='));
    log.mockClear();
    await crear({ NODE_ENV: 'production' }).forgot('ana@x.com', NOW);
    await espera(); await espera();
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('token='));
    log.mockRestore();
  });
});

describe('MailService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sin configuración no manda nada y no rompe', async () => {
    const m = new MailService(new ConfigService({}));
    expect(m.provider).toBeNull();
    expect(await m.send({ to: 'a@x.com', subject: 's', text: 't', html: 'h' })).toBe(false);
  });

  it('con Resend llama a su API con la clave', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    const m = new MailService(new ConfigService({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: 'clave', MAIL_FROM: 'CLB <a@b.com>' }));
    expect(await m.send({ to: 'a@x.com', subject: 's', text: 't', html: 'h' })).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer clave' }),
    }));
  });

  it('si el proveedor falla, devuelve false (no tira error)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const m = new MailService(new ConfigService({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: 'clave' }));
    expect(await m.send({ to: 'a@x.com', subject: 's', text: 't', html: 'h' })).toBe(false);
  });

  it('con SMTP sin host queda desactivado', () => {
    expect(new MailService(new ConfigService({ MAIL_PROVIDER: 'smtp' })).provider).toBeNull();
    expect(new MailService(new ConfigService({ MAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.x.com' })).provider).toBe('smtp');
  });
});
