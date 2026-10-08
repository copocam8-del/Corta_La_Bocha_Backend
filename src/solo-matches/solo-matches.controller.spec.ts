import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SoloMatchesController } from './solo-matches.controller';
import { SoloMatchesService } from './solo-matches.service';
import { authValidationPipe } from '../auth/auth-validation.pipe';
import { FinishQuickMatchDto, StartQuickMatchDto } from './dto/quick-match.dto';

async function errores(metatype: new () => object, body: object) {
  try {
    await authValidationPipe.transform(body, { type: 'body', metatype });
    return undefined;
  } catch (e) {
    if (!(e instanceof BadRequestException)) throw e;
    return (e.getResponse() as { errors: Record<string, string[]> }).errors;
  }
}

describe('SoloMatchesController', () => {
  let controller: SoloMatchesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SoloMatchesController],
      providers: [{ provide: SoloMatchesService, useValue: {} }],
    }).compile();

    controller = module.get<SoloMatchesController>(SoloMatchesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('valida temática, dificultad y tiempo al empezar', async () => {
    expect(await errores(StartQuickMatchDto, { tematica: 'general', dificultad: 'medio', tiempo: 60 })).toBeUndefined();
    expect(await errores(StartQuickMatchDto, { tematica: 'x', dificultad: 'imposible', tiempo: 5 })).toEqual({
      tematica: ['Temática inválida'],
      dificultad: ['Dificultad inválida'],
      tiempo: ['El tiempo debe ser 60 o 120 segundos'],
    });
  });

  it('acepta respuestas vacías y rechaza respuestas demasiado largas', async () => {
    expect(await errores(FinishQuickMatchDto, { answers: [{ category: 'Jugador', answer: null }] })).toBeUndefined();
    expect(await errores(FinishQuickMatchDto, { answers: [{ category: 'Jugador', answer: 'x'.repeat(151) }] })).toBeDefined();
  });
});
