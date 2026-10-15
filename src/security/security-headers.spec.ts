import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WebSocketGateway } from '@nestjs/websockets';
import request from 'supertest';
import { configureApp } from '../app.setup';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

// Gateway mínimo con la misma config de CORS que el real, para ver que helmet no rompe Socket.IO
@WebSocketGateway({ cors: { origin: true } })
class PingGateway {}

const FRONT = 'https://corta-la-bocha.vercel.app';

describe('Cabeceras de seguridad (helmet)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ controllers: [PingController], providers: [PingGateway] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication, `${FRONT},http://localhost:5173`);
    await app.init();
  });

  afterAll(() => app.close());

  it('manda HSTS de 1 año con subdominios, nosniff, DENY y Referrer-Policy', async () => {
    const res = await request(app.getHttpServer()).get('/ping').expect(200);
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS sigue funcionando para el frontend (también el preflight)', async () => {
    const res = await request(app.getHttpServer()).get('/ping').set('Origin', FRONT).expect(200);
    expect(res.headers['access-control-allow-origin']).toBe(FRONT);

    const pre = await request(app.getHttpServer())
      .options('/ping')
      .set('Origin', FRONT)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe(FRONT);
  });

  it('un origen que no está en CORS_ORIGIN no recibe permiso', async () => {
    const res = await request(app.getHttpServer()).get('/ping').set('Origin', 'https://malo.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('Socket.IO sigue aceptando el handshake', async () => {
    const res = await request(app.getHttpServer())
      .get('/socket.io/?EIO=4&transport=polling')
      .set('Origin', FRONT)
      .expect(200);
    expect(res.text.startsWith('0{')).toBe(true); // "0" = paquete "open" de engine.io
    expect(res.headers['access-control-allow-origin']).toBe(FRONT);
  });
});
