import { Test, TestingModule } from '@nestjs/testing';
import { TuttiFruttiController } from './tutti-frutti.controller';
import { TuttiFruttiValidatorService } from './tutti-frutti.service';
import { ConfigService } from '@nestjs/config';
import { ValidateRoundDto, ValidateRoundResponseDto } from './dto/validate-round.dto';
import { BadRequestException } from '@nestjs/common';

describe('TuttiFruttiController', () => {
  let controller: TuttiFruttiController;
  let service: TuttiFruttiValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TuttiFruttiController],
      providers: [
        TuttiFruttiValidatorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'OPENAI_API_KEY') return undefined;
              return null;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<TuttiFruttiController>(TuttiFruttiController);
    service = module.get<TuttiFruttiValidatorService>(TuttiFruttiValidatorService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('validateRound', () => {
    it('should call service.validateRound with correct parameters', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'M',
        answers: [
          {
            category: 'Jugador',
            answer: 'Messi',
          },
        ],
      };

      const spy = jest.spyOn(service, 'validateRound');
      await controller.validateRound(dto);

      expect(spy).toHaveBeenCalledWith(dto);
    });

    it('should return response from service', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'M',
        answers: [
          {
            category: 'Jugador',
            answer: 'Messi',
          },
        ],
      };

      const expectedResponse: ValidateRoundResponseDto = {
        roundLetter: 'M',
        totalPoints: 5,
        results: [
          {
            category: 'Jugador',
            userAnswer: 'Messi',
            aiAnswer: 'Messi',
            isValid: true,
            reason: 'Valid player',
            points: 5,
          },
        ],
        timestamp: new Date().toISOString(),
      };

      jest.spyOn(service, 'validateRound').mockResolvedValue(expectedResponse);

      const result = await controller.validateRound(dto);

      expect(result).toEqual(expectedResponse);
    });

    it('should propagate validation errors from service', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'AB',
        answers: [],
      };

      jest.spyOn(service, 'validateRound').mockRejectedValue(new BadRequestException('Invalid letter'));

      await expect(controller.validateRound(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw error if request body is null', async () => {
      await expect(controller.validateRound(null as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw error if request body is undefined', async () => {
      await expect(controller.validateRound(undefined as any)).rejects.toThrow(BadRequestException);
    });
  });
});
