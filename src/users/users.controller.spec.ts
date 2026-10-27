import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { StatsService } from '../stats/stats.service';
import { AchievementsService } from '../achievements/achievements.service';
import { authValidationPipe } from '../auth/auth-validation.pipe';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AceptarTerminosDto } from './dto/aceptar-terminos.dto';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

// Lista "MÉTODO ruta" de todos los endpoints del controlador, en el orden en que se declaran
function rutas(): string[] {
  const proto = UsersController.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((k) => k !== 'constructor')
    .map((k) => {
      const handler = proto[k] as object;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string;
      return `${RequestMethod[method]} ${path}`;
    });
}

async function validar(body: object) {
  try {
    return { dto: (await authValidationPipe.transform(body, { type: 'body', metatype: UpdateProfileDto })) as UpdateProfileDto };
  } catch (e) {
    if (!(e instanceof BadRequestException)) throw e;
    return { errors: (e.getResponse() as { errors: Record<string, string[]> }).errors };
  }
}

describe('UsersController', () => {
  const usersService = { findOne: jest.fn(), findAll: jest.fn(), update: jest.fn(), aceptarTerminos: jest.fn() };
  const statsService = { getUserRanking: jest.fn(), getTopPlayers: jest.fn(), getLeaderboard: jest.fn() };
  const achievementsService = { listForUser: jest.fn() };
  let controller: UsersController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])],
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: StatsService, useValue: statsService },
        { provide: AchievementsService, useValue: achievementsService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('no permite editar ni borrar a otro usuario por id', () => {
    expect(rutas()).not.toContain('PUT :id');
    expect(rutas()).not.toContain('DELETE :id');
  });

  it('las rutas fijas (ranking) se declaran antes que :id', () => {
    const r = rutas();
    expect(r.indexOf('GET ranking')).toBeLessThan(r.indexOf('GET :id'));
  });

  it('PUT /users/me edita sólo al usuario del token', async () => {
    await controller.updateMe({ user: { userId: 'u1' } }, { bio: 'hola' });
    expect(usersService.update).toHaveBeenCalledWith('u1', { bio: 'hola' });
  });

  it('GET /users/me/ranking usa el usuario del token', async () => {
    await controller.getMyRanking({ user: { userId: 'u1' } });
    expect(statsService.getUserRanking).toHaveBeenCalledWith('u1', 'global', undefined);
    await controller.getMyRanking({ user: { userId: 'u1' } }, 'semanal');
    expect(statsService.getUserRanking).toHaveBeenLastCalledWith('u1', 'semanal', undefined);
  });

  it('GET /users/ranking acepta global, semanal, mensual y elo; otro período da 400', async () => {
    await controller.getRanking('elo');
    expect(statsService.getLeaderboard).toHaveBeenCalledWith('elo', 50, undefined);
    expect(() => controller.getRanking('anual')).toThrow('Período inválido');
  });

  it('POST /users/me/aceptar-terminos acepta sólo para el usuario del token y tiene límite de pedidos', async () => {
    await controller.aceptarTerminos({ user: { userId: 'u1' } }, { version: '2026-10-27' });
    expect(usersService.aceptarTerminos).toHaveBeenCalledWith('u1', '2026-10-27');
    expect(rutas()).toContain('POST me/aceptar-terminos');
    const guards = (Reflect.getMetadata('__guards__', UsersController.prototype.aceptarTerminos) ?? []) as unknown[];
    expect(guards).toContain(ThrottlerGuard);
  });

  it('aceptar-terminos exige la versión como texto corto', async () => {
    const validarVersion = (body: object) =>
      authValidationPipe.transform(body, { type: 'body', metatype: AceptarTerminosDto }).then(() => null, (e: BadRequestException) =>
        (e.getResponse() as { errors: Record<string, string[]> }).errors);
    expect(await validarVersion({})).toEqual({ version: ['Falta la versión de los Términos'] });
    expect(await validarVersion({ version: 20261027 })).toEqual({ version: ['La versión de los Términos no es válida'] });
    expect(await validarVersion({ version: 'x'.repeat(21) })).toEqual({ version: ['La versión de los Términos no es válida'] });
    expect(await validarVersion({ version: '2026-10-27' })).toBeNull();
  });

  it('GET /users/me/achievements usa el usuario del token', async () => {
    await controller.getMyAchievements({ user: { userId: 'u1' } });
    expect(achievementsService.listForUser).toHaveBeenCalledWith('u1');
  });

  describe('validación del perfil', () => {
    it('acepta un avatar del set y textos válidos', async () => {
      const { dto, errors } = await validar({ avatar_id: 'trofeo', favorite_player: ' Riquelme ', bio: 'Hincha' });
      expect(errors).toBeUndefined();
      expect(dto).toMatchObject({ avatar_id: 'trofeo', favorite_player: 'Riquelme' });
    });

    it('rechaza un avatar que no es del set (no se aceptan URLs libres)', async () => {
      const { errors } = await validar({ avatar_id: 'https://malo.com/x.png' });
      expect(errors).toEqual({ avatar_id: ['Elegí uno de los avatares disponibles'] });
    });

    it('un texto vacío borra el campo (se guarda null)', async () => {
      const { dto } = await validar({ favorite_team: '   ', bio: '' });
      expect(dto).toMatchObject({ favorite_team: null, bio: null });
    });

    it('aplica las reglas del nombre de usuario y los largos máximos', async () => {
      const { errors } = await validar({ username: 'a b', bio: 'x'.repeat(161), favorite_team: 'x'.repeat(101) });
      expect(Object.keys(errors!).sort()).toEqual(['bio', 'favorite_team', 'username']);
    });

    it('acepta nombre y apellido (sin espacios de más)', async () => {
      const { dto, errors } = await validar({ first_name: '  Lionel ', last_name: 'Messi  ' });
      expect(errors).toBeUndefined();
      expect(dto).toMatchObject({ first_name: 'Lionel', last_name: 'Messi' });
    });

    it('nombre y apellido vacíos, con sólo espacios o null se ignoran (no se borran)', async () => {
      for (const vacio of ['', '   ', null]) {
        const { dto, errors } = await validar({ first_name: vacio, last_name: vacio, bio: 'Hola' });
        expect(errors).toBeUndefined();
        expect(dto!.first_name).toBeUndefined();
        expect(dto!.last_name).toBeUndefined();
        expect(dto!.bio).toBe('Hola');
      }
    });

    it('nombre y apellido con las mismas reglas que el registro (texto y hasta 50 caracteres)', async () => {
      const { errors } = await validar({ first_name: 'x'.repeat(51), last_name: 123 });
      expect(errors).toEqual({
        first_name: ['El nombre puede tener hasta 50 caracteres'],
        last_name: ['El apellido debe ser texto'],
      });
      const { errors: ok } = await validar({ first_name: 'x'.repeat(50), last_name: 'y'.repeat(50) });
      expect(ok).toBeUndefined();
    });

    it('descarta campos que no se pueden editar (ej. puntos)', async () => {
      const { dto } = await validar({ total_points: 99999, avatar_url: 'https://x' });
      expect(dto).not.toHaveProperty('total_points');
      expect(dto).not.toHaveProperty('avatar_url');
    });

    it('filtro de malas palabras: usuario, nombre, apellido y textos públicos', async () => {
      const { errors } = await validar({
        username: 'admin_1',
        first_name: 'Boludo',
        last_name: 'Puuuto',
        bio: 'sos un p.e.l.o.t.u.d.o',
        favorite_team: 'Negro villero FC',
        favorite_country: 'Sudacas',
        favorite_player: 'Messi la concha de tu madre',
      });
      expect(errors).toEqual({
        username: ['Ese nombre de usuario no está permitido. Elegí otro.'],
        first_name: ['Ese nombre no está permitido. Elegí otro.'],
        last_name: ['Ese apellido no está permitido. Elegí otro.'],
        bio: ['Ese texto no está permitido.'],
        favorite_team: ['Ese texto no está permitido.'],
        favorite_country: ['Ese texto no está permitido.'],
        favorite_player: ['Ese texto no está permitido.'],
      });
    });

    it('textos normales pasan (aunque se parezcan a una mala palabra)', async () => {
      const { errors } = await validar({
        username: 'Modric10',
        first_name: 'Concha',
        last_name: 'Acayaguá',
        bio: 'Me encanta la computadora y el pollo al horno',
        favorite_team: 'Scunthorpe United',
        favorite_country: 'Nigeria',
        favorite_player: 'Dick Advocaat',
      });
      expect(errors).toBeUndefined();
    });
  });
});
