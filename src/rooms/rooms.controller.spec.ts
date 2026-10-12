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
    expect(engine.createPrivateRoom).toHaveBeenCalledWith('u1', { tematica: 'mundial', rounds: 3, seconds: 60 });
    expect(res).toEqual({ code: 'ABC123' });
  });

  it('valida la configuración con mensajes en español', async () => {
    await expect(
      authValidationPipe.transform({ tematica: 'x', rounds: 4, seconds: 7 }, { type: 'body', metatype: CreateRoomDto }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      authValidationPipe.transform({ tematica: 'general', rounds: 3, seconds: 60 }, { type: 'body', metatype: CreateRoomDto }),
    ).resolves.toBeDefined();
  });
});
