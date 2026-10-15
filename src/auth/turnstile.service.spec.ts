import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TURNSTILE_URL, TurnstileService } from './turnstile.service';

// fetch siempre mockeado: los tests nunca llaman a Cloudflare
const SECRET = 'clave-secreta-de-prueba';
const TOKEN = 'token-del-widget-123';

const servicio = (secret?: string) => new TurnstileService({ get: () => secret } as unknown as ConfigService);
const respuesta = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

describe('TurnstileService', () => {
  let fetchMock: jest.SpyInstance;
  let logs: string[];

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    logs = [];
    for (const nivel of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, nivel).mockImplementation((msg: unknown) => {
        logs.push(String(msg));
      });
    }
  });

  afterEach(() => jest.restoreAllMocks());

  it('sin TURNSTILE_SECRET_KEY se saltea (aunque no venga token) y avisa en el log', async () => {
    const s = servicio(undefined);
    expect(s.enabled).toBe(false);
    await expect(s.verify(undefined)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs.join('\n')).toMatch(/TURNSTILE_SECRET_KEY no definida/);
  });

  it('con la clave, sin token → 400 sin llamar a Cloudflare', async () => {
    await expect(servicio(SECRET).verify(undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('token válido → pasa; manda clave, token e IP a la API de Turnstile con timeout', async () => {
    fetchMock.mockResolvedValue(respuesta({ success: true }));
    await servicio(SECRET).verify(TOKEN, '1.2.3.4');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TURNSTILE_URL);
    expect(init.method).toBe('POST');
    const body = init.body as URLSearchParams;
    expect(body.get('secret')).toBe(SECRET);
    expect(body.get('response')).toBe(TOKEN);
    expect(body.get('remoteip')).toBe('1.2.3.4');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('token inválido → 400 con el error en el campo captchaToken', async () => {
    fetchMock.mockResolvedValue(respuesta({ success: false, 'error-codes': ['invalid-input-response'] }));
    const err = await servicio(SECRET).verify(TOKEN).catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({ errors: { captchaToken: [expect.any(String)] } });
  });

  it('Cloudflare tarda demasiado → 503 (no deja pasar sin verificar)', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }));
    await expect(servicio(SECRET).verify(TOKEN)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('Cloudflare responde error → 503', async () => {
    fetchMock.mockResolvedValue(respuesta({}, 500));
    await expect(servicio(SECRET).verify(TOKEN)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('nunca loguea el token ni la clave', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
    await servicio(SECRET).verify(TOKEN).catch(() => undefined);
    fetchMock.mockRejectedValueOnce(new Error('falló la red'));
    await servicio(SECRET).verify(TOKEN).catch(() => undefined);

    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) {
      expect(l).not.toContain(TOKEN);
      expect(l).not.toContain(SECRET);
    }
  });
});
