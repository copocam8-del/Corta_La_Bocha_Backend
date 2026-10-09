import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  const categoriesService = { findAll: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: categoriesService }],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  it('sin filtro pide todas las categorías', () => {
    controller.findAll();
    expect(categoriesService.findAll).toHaveBeenCalledWith(undefined);
  });

  it('?advanced=true / false filtra por avanzadas', () => {
    controller.findAll('true');
    controller.findAll('false');
    expect(categoriesService.findAll).toHaveBeenNthCalledWith(1, true);
    expect(categoriesService.findAll).toHaveBeenNthCalledWith(2, false);
  });
});
