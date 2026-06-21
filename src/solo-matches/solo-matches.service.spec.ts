import { Test, TestingModule } from '@nestjs/testing';
import { SoloMatchesService } from './solo-matches.service';

describe('SoloMatchesService', () => {
  let service: SoloMatchesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SoloMatchesService],
    }).compile();

    service = module.get<SoloMatchesService>(SoloMatchesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
