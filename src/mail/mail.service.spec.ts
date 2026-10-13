import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_TIMEOUT_MS, MailService, separarRemitente } from './mail.service';

// fetch siempre mockeado: los tests nunca mandan mails de verdad
const CLAVE = 'xkeysib-clave-secreta-de-prueba';
const MAIL = { to: 'hincha@mail.com', subject: 'Recuperá tu contraseña', text: 'Link: https://x', html: '<p>Link</p>' };

function servicio(vars: Record<string, string | undefined>) {
  const config = { get: (k: string) => vars[k] } as unknown as ConfigService;
  return new MailService(config);
}

describe('MailService con Brevo', () => {
  let fetchMock: jest.SpyInstance;
  let logs: string[];

  beforeEach(() => {
    logs = [];
    fetchMock = jest.spyOn(global, 'fetch');
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => void logs.push(String(m)));
    jest.spyOn(Logger.prototype, 'error').mockImplementation((m: unknown) => void logs.push(String(m)));
  });
  afterEach(() => jest.restoreAllMocks());

  it('separa el nombre y el mail del remitente', () => {
    expect(separarRemitente('Corta La Bocha <no-responder@cortalabocha.com>')).toEqual({ name: 'Corta La Bocha', email: 'no-responder@cortalabocha.com' });
    expect(separarRemitente('"El Equipo" <equipo@x.com>')).toEqual({ name: 'El Equipo', email: 'equipo@x.com' });
    expect(separarRemitente('solo@x.com')).toEqual({ name: 'Corta La Bocha', email: 'solo@x.com' });
  });

  it('manda el mail por la API HTTP de Brevo con el formato que pide', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ messageId: 'abc' }), { status: 201 }));
    const s = servicio({ MAIL_PROVIDER: 'brevo', BREVO_API_KEY: CLAVE, MAIL_FROM: 'Corta La Bocha <no-responder@cortalabocha.com>' });
    expect(s.provider).toBe('brevo');
    expect(await s.send(MAIL)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['api-key']).toBe(CLAVE);
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'Corta La Bocha', email: 'no-responder@cortalabocha.com' },
      to: [{ email: 'hincha@mail.com' }],
      subject: 'Recuperá tu contraseña',
      htmlContent: '<p>Link</p>',
      textContent: 'Link: https://x',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal); // con timeout
    expect(MAIL_TIMEOUT_MS).toBe(10_000);
  });

  it('sin clave: avisa en el log y no manda nada', async () => {
    const s = servicio({ MAIL_PROVIDER: 'brevo', MAIL_FROM: 'X <x@x.com>' });
    expect(s.provider).toBeNull();
    expect(await s.send(MAIL)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs.join(' ')).toContain('falta BREVO_API_KEY');
  });

  it('si Brevo responde error: devuelve false, loguea sin la clave ni datos del mail', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'unauthorized', message: 'Key not found for hincha@mail.com' }), { status: 401 }),
    );
    const s = servicio({ MAIL_PROVIDER: 'brevo', BREVO_API_KEY: CLAVE, MAIL_FROM: 'X <x@x.com>' });
    expect(await s.send(MAIL)).toBe(false);
    const log = logs.join(' ');
    expect(log).toContain('Brevo respondió 401 (unauthorized)');
    expect(log).not.toContain(CLAVE);
    expect(log).not.toContain('hincha@mail.com');
    expect(log).not.toContain('Link');
  });

  it('si Brevo no responde a tiempo: devuelve false y lo avisa (sin tirar error)', async () => {
    const timeout = new Error('timeout');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValue(timeout);
    const s = servicio({ MAIL_PROVIDER: 'brevo', BREVO_API_KEY: CLAVE });
    await expect(s.send(MAIL)).resolves.toBe(false);
    expect(logs.join(' ')).toContain('no respondió en 10 s');
  });

  it('sin MAIL_PROVIDER no manda nada (como antes)', async () => {
    const s = servicio({});
    expect(await s.send(MAIL)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs.join(' ')).toContain('no está configurado');
  });
});
