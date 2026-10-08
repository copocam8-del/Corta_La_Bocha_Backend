import { Test, TestingModule } from '@nestjs/testing';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';

describe('RoomsController', () => {
  let controller: RoomsController;
  const roomsService = { finishMatch: jest.fn() };
  const gateway = { emitToRoom: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [
        { provide: RoomsService, useValue: roomsService },
        { provide: RoomsGateway, useValue: gateway },
      ],
    }).compile();

    controller = module.get<RoomsController>(RoomsController);
  });

  it('al terminar la partida avisa a toda la sala', async () => {
    roomsService.finishMatch.mockResolvedValue({ matchId: 'm1', standings: [] });
    await controller.finishMatch('abc123', 'm1', { user: { userId: 'u1' } });
    expect(roomsService.finishMatch).toHaveBeenCalledWith('abc123', 'm1', 'u1');
    expect(gateway.emitToRoom).toHaveBeenCalledWith('ABC123', 'match_finished', { matchId: 'm1', standings: [] });
  });
});
