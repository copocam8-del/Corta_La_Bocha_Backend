import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { PasswordResetService } from './password-reset.service';

// Tests de /auth por HTTP de verdad (pipe, guards y códigos de estado), con los servicios simulados.
const registroValido = {
  username: 'messi_10',
  birthDate: '1987-06-24',
  email: 'leo@mail.com',
  password: 'gambeta-de-potrero',
};

describe('/auth por HTTP', () => {
  let app: INestApplication;
  const authService = { register: jest.fn(), login: jest.fn() };
  const passwordReset = { forgot: jest.fn(), reset: jest.fn() };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: GoogleAuthService, useValue: { login: jest.fn() } },
        { provide: PasswordResetService, useValue: passwordReset },
      ],
    })
      // El límite por IP tiene su propio test (auth.controller.spec.ts): acá se prueba otra cosa
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    authService.register.mockResolvedValue({ message: 'Usuario creado', userId: 'u1', username: 'messi_10' });
    passwordReset.reset.mockResolvedValue({ message: 'ok' });
  });

  describe('contraseñas comunes', () => {
    it.each(['12345678', 'password', 'PassWord', 'Argentina10'])('el registro rechaza "%s" con 400', async (password) => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...registroValido, password })
        .expect(400);
      expect(res.body.errors.password).toEqual(['Esa contraseña es muy común. Elegí otra más difícil de adivinar.']);
      expect(authService.register).not.toHaveBeenCalled();
    });

    it.each(['12345678', 'password'])('reset-password rechaza "%s" con 400', async (password) => {
      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'abc', password })
        .expect(400);
      expect(res.body.errors.password[0]).toMatch(/muy común/);
      expect(passwordReset.reset).not.toHaveBeenCalled();
    });

    it('una contraseña que no es común pasa', async () => {
      await request(app.getHttpServer()).post('/auth/register').send(registroValido).expect(201);
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'abc', password: 'gambeta-de-potrero' })
        .expect(200);
    });

    it('una contraseña corta muestra el error de largo, no el de "común"', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...registroValido, password: '1234' })
        .expect(400);
      expect(res.body.errors.password[0]).toMatch(/entre 8 y 72/);
    });
  });
});
