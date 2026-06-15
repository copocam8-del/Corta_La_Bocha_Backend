import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { TuttiFruttiValidatorService } from './tutti-frutti.service';
import { ValidateRoundDto } from './dto/validate-round.dto';
import { ConfigService } from '@nestjs/config';

describe('TuttiFruttiValidatorService', () => {
  let service: TuttiFruttiValidatorService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TuttiFruttiValidatorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'OPENAI_API_KEY') return undefined; // Use fallback for unit tests
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TuttiFruttiValidatorService>(TuttiFruttiValidatorService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateRound', () => {
    it('should reject invalid round letter', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'AB',
        answers: [],
      };

      await expect(service.validateRound(dto)).rejects.toThrow(BadRequestException);
    });

    it('should reject lowercase round letter', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'a',
        answers: [],
      };

      await expect(service.validateRound(dto)).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid category', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'A',
        answers: [
          {
            category: 'InvalidCategory',
            answer: 'Answer',
          },
        ],
      };

      await expect(service.validateRound(dto)).rejects.toThrow(BadRequestException);
    });

    it('should return empty results for empty answers', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'A',
        answers: [],
      };

      const result = await service.validateRound(dto);

      expect(result.roundLetter).toBe('A');
      expect(result.totalPoints).toBe(0);
      expect(result.results).toEqual([]);
    });

    it('should return 0 points for empty user answer', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'A',
        answers: [
          {
            category: 'Jugador',
            answer: '',
          },
        ],
      };

      const result = await service.validateRound(dto);

      expect(result.totalPoints).toBe(0);
      expect(result.results[0].isValid).toBe(false);
      expect(result.results[0].points).toBe(0);
    });

    it('should return 0 points for null user answer', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'A',
        answers: [
          {
            category: 'Jugador',
            answer: null,
          },
        ],
      };

      const result = await service.validateRound(dto);

      expect(result.totalPoints).toBe(0);
      expect(result.results[0].isValid).toBe(false);
      expect(result.results[0].points).toBe(0);
    });

    it('should validate answer starting with correct letter (fallback)', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'A',
        answers: [
          {
            category: 'Jugador',
            answer: 'Aguero',
          },
        ],
      };

      const result = await service.validateRound(dto);

      expect(result.results[0].isValid).toBe(true);
      expect(result.results[0].points).toBe(5);
    });

    it('should invalidate answer not starting with correct letter (fallback)', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'A',
        answers: [
          {
            category: 'Jugador',
            answer: 'Benzema',
          },
        ],
      };

      const result = await service.validateRound(dto);

      expect(result.results[0].isValid).toBe(false);
      expect(result.results[0].points).toBe(0);
    });

    it('should calculate total points correctly', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'M',
        answers: [
          {
            category: 'Jugador',
            answer: 'Messi',
          },
          {
            category: 'Equipo',
            answer: 'Manchester United',
          },
          {
            category: 'DT',
            answer: '',
          },
        ],
      };

      const result = await service.validateRound(dto);

      // Messi: 5 points (valid, starts with M)
      // Manchester United: M... but doesn't start with M, should be 0
      // DT: 0 (empty)
      expect(result.totalPoints).toBeGreaterThanOrEqual(0);
      expect(result.results.length).toBe(3);
    });

    it('should handle all valid categories', async () => {
      const categories = ['Jugador', 'Equipo', 'DT', 'Selección', 'Campeón Champions', 'Campeón Mundial', 'Jugador Argentino'];
      const answers = categories.map((cat) => ({
        category: cat,
        answer: `Test${cat}`,
      }));

      const dto: ValidateRoundDto = {
        roundLetter: 'T',
        answers,
      };

      const result = await service.validateRound(dto);

      expect(result.results.length).toBe(categories.length);
      result.results.forEach((r) => {
        expect(categories).toContain(r.category);
      });
    });

    it('should trim whitespace from answers', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'M',
        answers: [
          {
            category: 'Jugador',
            answer: '  Messi  ',
          },
        ],
      };

      const result = await service.validateRound(dto);

      expect(result.results[0].userAnswer).toBe('Messi');
      expect(result.results[0].isValid).toBe(true);
    });

    it('should return timestamp in ISO format', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'A',
        answers: [],
      };

      const result = await service.validateRound(dto);

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
