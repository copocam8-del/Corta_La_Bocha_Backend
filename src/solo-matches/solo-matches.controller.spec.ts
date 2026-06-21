import { Test, TestingModule } from '@nestjs/testing';
import { SoloMatchesController } from './solo-matches.controller';

describe('SoloMatchesController', () => {
  let controller: SoloMatchesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SoloMatchesController],
    }).compile();

    controller = module.get<SoloMatchesController>(SoloMatchesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
