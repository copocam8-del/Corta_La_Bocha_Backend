import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { PasswordResetService } from './password-reset.service';
import { EMAIL_WINDOW_MS, EmailAttemptLimiter } from './email-attempt-limiter';

// Tests de /auth por HTTP de verdad (pipe, guards y códigos de estado), con los servicios simulados.
const registroValido = {
  username: 'messi_10',
  birthDate: '1987-06-24',
  email: 'leo@mail.com',
  password: 'gambeta-de-potrero',
};

describe('/auth por HTTP', () => {
  let app: INestApplication;
  let limiter: EmailAttemptLimiter;
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
        EmailAttemptLimiter,
      ],
    })
      // El límite por IP tiene su propio test (auth.controller.spec.ts): acá se prueba otra cosa
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = mod.createNestApplication();
    limiter = mod.get(EmailAttemptLimiter);
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    authService.register.mockResolvedValue({ message: 'Usuario creado', userId: 'u1', username: 'messi_10' });
    passwordReset.reset.mockResolvedValue({ message: 'ok' });
    passwordReset.forgot.mockResolvedValue({ message: 'ok' });
    authService.login.mockRejectedValue(new UnauthorizedException('Credenciales inválidas'));
    limiter.now = () => Date.now();
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

  describe('mails descartables', () => {
    it.each(['alguien@mailinator.com', 'x@10minutemail.com', 'x@YOPMAIL.com', 'x@sub.mailinator.com'])(
      'el registro rechaza %s con 400',
      async (email) => {
        const res = await request(app.getHttpServer())
          .post('/auth/register')
          .send({ ...registroValido, email })
          .expect(400);
        expect(res.body.errors.email).toEqual(['No aceptamos mails temporales o descartables. Usá tu mail de siempre.']);
        expect(authService.register).not.toHaveBeenCalled();
      },
    );

    it('un mail común pasa', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...registroValido, email: 'leo@gmail.com' })
        .expect(201);
    });
  });
});

describe('/auth: límite de intentos por email', () => {
  let app: INestApplication;
  let limiter: EmailAttemptLimiter;
  let reloj: number;
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
        EmailAttemptLimiter,
      ],
    })
      // Sin el límite por IP: así se ve que el de email funciona solo (como si cambiaran de IP)
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = mod.createNestApplication();
    limiter = mod.get(EmailAttemptLimiter);
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    reloj = 1_000_000;
    limiter.now = () => reloj;
    authService.login.mockRejectedValue(new UnauthorizedException('Credenciales inválidas'));
    passwordReset.forgot.mockResolvedValue({ message: 'ok' });
  });

  const login = (email: string, password = 'mala-clave') =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  it('5 logins fallidos con el mismo email → el 6º da 429 sin probar la contraseña', async () => {
    for (let i = 0; i < 5; i++) await login('victima@mail.com').expect(401);
    const res = await login('victima@mail.com').expect(429);
    expect(res.body.message).toMatch(/Esperá 15 minutos/);
    expect(authService.login).toHaveBeenCalledTimes(5);
  });

  it('cuenta igual con mayúsculas y espacios en el email', async () => {
    for (let i = 0; i < 5; i++) await login(i % 2 ? 'Mayus@Mail.com' : 'mayus@mail.com').expect(401);
    await login('MAYUS@MAIL.COM').expect(429);
  });

  it('otro email no se ve afectado', async () => {
    for (let i = 0; i < 5; i++) await login('uno@mail.com').expect(401);
    await login('otro@mail.com').expect(401);
  });

  it('a los 15 minutos se libera', async () => {
    for (let i = 0; i < 5; i++) await login('espera@mail.com').expect(401);
    await login('espera@mail.com').expect(429);
    reloj += EMAIL_WINDOW_MS + 1;
    await login('espera@mail.com').expect(401);
  });

  it('un login correcto limpia los fallidos', async () => {
    for (let i = 0; i < 4; i++) await login('olvidadizo@mail.com').expect(401);
    authService.login.mockResolvedValueOnce({ access_token: 't', username: 'u', name: null });
    await login('olvidadizo@mail.com', 'la-buena').expect(201);
    for (let i = 0; i < 4; i++) await login('olvidadizo@mail.com').expect(401);
    await login('olvidadizo@mail.com').expect(401); // 5º fallido desde el correcto: todavía no bloquea
    await login('olvidadizo@mail.com').expect(429);
  });

  it('forgot-password: 5 pedidos por email cada 15 minutos', async () => {
    const forgot = () => request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'spam@mail.com' });
    for (let i = 0; i < 5; i++) await forgot().expect(200);
    await forgot().expect(429);
    expect(passwordReset.forgot).toHaveBeenCalledTimes(5);
    reloj += EMAIL_WINDOW_MS + 1;
    await forgot().expect(200);
  });

  it('los contadores de login y de forgot-password son independientes', async () => {
    for (let i = 0; i < 5; i++) await login('mixto@mail.com').expect(401);
    await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'mixto@mail.com' }).expect(200);
  });
});
