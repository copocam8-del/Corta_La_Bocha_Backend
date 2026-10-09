import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TuttiFruttiController } from './tutti-frutti.controller';
import { TuttiFruttiValidatorService } from './tutti-frutti.service';

describe('TuttiFruttiController', () => {
  let controller: TuttiFruttiController;
  const service = { validateRound: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])],
      controllers: [TuttiFruttiController],
      providers: [{ provide: TuttiFruttiValidatorService, useValue: service }],
    }).compile();
    controller = module.get(TuttiFruttiController);
  });

  it('delega en el servicio', async () => {
    service.validateRound.mockResolvedValue({ totalPoints: 20 });
    await expect(controller.validateRound({ roundLetter: 'M', answers: [] })).resolves.toEqual({ totalPoints: 20 });
  });

  it('pide sesión y tiene límite de intentos (cada llamada puede gastar OpenAI)', () => {
    const guards = Reflect.getMetadata('__guards__', TuttiFruttiController.prototype.validateRound) as unknown[];
    expect(guards).toContain(ThrottlerGuard);
    expect(guards).toHaveLength(2); // AuthGuard('jwt') + ThrottlerGuard
  });
});
