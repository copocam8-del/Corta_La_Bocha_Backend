import { Test, TestingModule } from '@nestjs/testing';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Lista "MÉTODO ruta" de todos los endpoints del controlador
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

describe('UsersController', () => {
  const usersService = { findOne: jest.fn(), findAll: jest.fn(), update: jest.fn() };
  let controller: UsersController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('no permite editar ni borrar a otro usuario por id', () => {
    expect(rutas()).not.toContain('PUT :id');
    expect(rutas()).not.toContain('DELETE :id');
  });

  it('PUT /users/me edita sólo al usuario del token', async () => {
    await controller.updateMe({ user: { userId: 'u1' } }, { bio: 'hola' });
    expect(usersService.update).toHaveBeenCalledWith('u1', { bio: 'hola' });
  });
});
