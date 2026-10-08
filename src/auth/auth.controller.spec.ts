import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { authValidationPipe } from './auth-validation.pipe';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

// Pasa el body por el mismo pipe que usa el controlador y devuelve el DTO o los errores por campo
async function validate<T>(metatype: new () => T, body: object) {
  try {
    const dto = await authValidationPipe.transform(body, { type: 'body', metatype });
    return { dto: dto as T, errors: undefined };
  } catch (e) {
    if (!(e instanceof BadRequestException)) throw e;
    return { dto: undefined, errors: (e.getResponse() as any).errors as Record<string, string[]> };
  }
}

const hoyMenos = (años: number, dias = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - años);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

const registroValido = {
  username: 'messi_10',
  name: 'Lionel',
  lastName: 'Messi',
  birthDate: '1987-06-24',
  country: 'Argentina',
  email: 'leo@mail.com',
  password: 'contraseña123',
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { register: jest.fn(), login: jest.fn() } },
        { provide: GoogleAuthService, useValue: { login: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

describe('Validación de /auth/register', () => {
  it('acepta un registro válido y pasa el email a minúsculas', async () => {
    const { dto, errors } = await validate(RegisterDto, { ...registroValido, email: ' Leo@Mail.com ' });
    expect(errors).toBeUndefined();
    expect(dto!.email).toBe('leo@mail.com');
  });

  it('descarta campos que no están en el DTO', async () => {
    const { dto } = await validate(RegisterDto, { ...registroValido, is_guest: true });
    expect(dto).not.toHaveProperty('is_guest');
  });

  it.each([
    ['1234567', 'corta'],
    ['a'.repeat(73), 'larga'],
  ])('rechaza la contraseña %s (%s)', async (password) => {
    const { errors } = await validate(RegisterDto, { ...registroValido, password });
    expect(errors!.password[0]).toMatch(/entre 8 y 72/);
  });

  it('acepta contraseñas de 8 y de 72 caracteres', async () => {
    expect((await validate(RegisterDto, { ...registroValido, password: 'a'.repeat(8) })).errors).toBeUndefined();
    expect((await validate(RegisterDto, { ...registroValido, password: 'a'.repeat(72) })).errors).toBeUndefined();
  });

  it.each(['ab', 'a'.repeat(31), 'con espacio', 'ñandú', 'leo-messi'])('rechaza el usuario "%s"', async (username) => {
    const { errors } = await validate(RegisterDto, { ...registroValido, username });
    expect(errors!.username).toBeDefined();
  });

  it.each(['abc', 'a'.repeat(30), 'Leo_10'])('acepta el usuario "%s"', async (username) => {
    const { errors } = await validate(RegisterDto, { ...registroValido, username });
    expect(errors).toBeUndefined();
  });

  it('rechaza a menores de 13 años', async () => {
    const { errors } = await validate(RegisterDto, { ...registroValido, birthDate: hoyMenos(13, 1) });
    expect(errors!.birthDate).toEqual(['Tenés que tener al menos 13 años para registrarte']);
  });

  it('acepta a quien cumple 13 años hoy', async () => {
    const { errors } = await validate(RegisterDto, { ...registroValido, birthDate: hoyMenos(13) });
    expect(errors).toBeUndefined();
  });

  it('exige la fecha de nacimiento', async () => {
    const { birthDate, ...sinFecha } = registroValido;
    const { errors } = await validate(RegisterDto, sinFecha);
    expect(errors!.birthDate).toBeDefined();
  });

  it('muestra un solo mensaje claro por campo cuando falta todo', async () => {
    const { errors } = await validate(RegisterDto, {});
    expect(errors).toEqual({
      birthDate: ['Ingresá tu fecha de nacimiento'],
      email: ['Ingresá tu email'],
      password: ['Ingresá una contraseña'],
    });
  });

  it('devuelve todos los errores agrupados por campo', async () => {
    const { errors } = await validate(RegisterDto, { email: 'no-es-email', password: 123 });
    expect(Object.keys(errors!).sort()).toEqual(['birthDate', 'email', 'password']);
  });
});

describe('Validación de /auth/login', () => {
  it('normaliza el email', async () => {
    const { dto } = await validate(LoginDto, { email: 'LEO@MAIL.COM', password: 'x' });
    expect(dto!.email).toBe('leo@mail.com');
  });

  it('acepta contraseñas viejas de menos de 8 caracteres', async () => {
    const { errors } = await validate(LoginDto, { email: 'leo@mail.com', password: '123456' });
    expect(errors).toBeUndefined();
  });

  it('rechaza el body vacío', async () => {
    const { errors } = await validate(LoginDto, {});
    expect(Object.keys(errors!).sort()).toEqual(['email', 'password']);
  });
});
