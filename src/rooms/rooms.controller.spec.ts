import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { MultiplayerService } from './multiplayer.service';
import { authValidationPipe } from '../auth/auth-validation.pipe';
import { CreateRoomDto } from './dto/create-room.dto';

describe('RoomsController', () => {
  let controller: RoomsController;
  const engine = { createPrivateRoom: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [
        { provide: RoomsService, useValue: { summary: jest.fn() } },
        { provide: MultiplayerService, useValue: { engine } },
      ],
    }).compile();
    controller = module.get(RoomsController);
  });

  it('crea la sala privada con quien la pide como anfitrión y devuelve el código', async () => {
    engine.createPrivateRoom.mockResolvedValue({ ok: true, code: 'ABC123' });
    const res = await controller.create({ tematica: 'mundial', rounds: 3, seconds: 60 }, { user: { userId: 'u1' } });
    expect(engine.createPrivateRoom).toHaveBeenCalledWith('u1', { tematica: 'mundial', rounds: 3, seconds: 60 }, 'tutti_frutti');
    expect(res).toEqual({ code: 'ABC123' });
  });

  it('crea salas de los otros juegos', async () => {
    engine.createPrivateRoom.mockResolvedValue({ ok: true, code: 'TRI123' });
    await controller.create({ game: 'trivia', dificultad: 'facil', rounds: 5, seconds: 15 }, { user: { userId: 'u1' } });
    expect(engine.createPrivateRoom).toHaveBeenCalledWith('u1', { dificultad: 'facil', rounds: 5, seconds: 15 }, 'trivia');
  });

  it('valida la configuración con mensajes en español (y la del juego da 400)', async () => {
    await expect(
      authValidationPipe.transform({ game: 'pacman' }, { type: 'body', metatype: CreateRoomDto }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      authValidationPipe.transform({ rounds: 'tres' }, { type: 'body', metatype: CreateRoomDto }),
    ).rejects.toThrow(BadRequestException);
    engine.createPrivateRoom.mockResolvedValue({ ok: false, error: 'Configuración inválida.' });
    await expect(controller.create({ tematica: 'x', rounds: 4, seconds: 7 }, { user: { userId: 'u1' } })).rejects.toThrow(BadRequestException);
    await expect(
      authValidationPipe.transform({ tematica: 'general', rounds: 3, seconds: 60 }, { type: 'body', metatype: CreateRoomDto }),
    ).resolves.toBeDefined();
  });
});
