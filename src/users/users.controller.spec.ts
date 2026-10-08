import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { StatsService } from '../stats/stats.service';
import { authValidationPipe } from '../auth/auth-validation.pipe';
import { UpdateProfileDto } from './dto/update-profile.dto';

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
  const usersService = { findOne: jest.fn(), findAll: jest.fn(), update: jest.fn() };
  const statsService = { getUserRanking: jest.fn(), getTopPlayers: jest.fn() };
  let controller: UsersController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: StatsService, useValue: statsService },
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
    expect(statsService.getUserRanking).toHaveBeenCalledWith('u1');
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

    it('descarta campos que no se pueden editar (ej. puntos)', async () => {
      const { dto } = await validar({ total_points: 99999, avatar_url: 'https://x' });
      expect(dto).not.toHaveProperty('total_points');
      expect(dto).not.toHaveProperty('avatar_url');
    });
  });
});
