import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { WS_ERROR, WsSafeAckInterceptor } from './ws-safe-ack.interceptor';

const contexto = {
  switchToWs: () => ({ getPattern: () => 'room:start' }),
  getHandler: () => ({ name: 'start' }),
} as unknown as ExecutionContext;

describe('WsSafeAckInterceptor', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('deja pasar la respuesta normal', async () => {
    const next: CallHandler = { handle: () => of({ ok: true, code: 'ABC' }) };
    await expect(lastValueFrom(new WsSafeAckInterceptor().intercept(contexto, next))).resolves.toEqual({ ok: true, code: 'ABC' });
  });

  it('si el handler tira una excepción, responde { ok: false } y lo loguea', async () => {
    const next: CallHandler = { handle: () => throwError(() => new Error('se rompió algo')) };
    await expect(lastValueFrom(new WsSafeAckInterceptor().intercept(contexto, next))).resolves.toEqual({ ok: false, error: WS_ERROR });
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('room:start'));
  });
});
