import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  const prisma = { categories: { findMany: jest.fn().mockResolvedValue([]) } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CategoriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('sólo devuelve categorías activas', async () => {
    await service.findAll();
    expect(prisma.categories.findMany.mock.calls[0][0].where).toEqual({ is_active: true });
  });

  it('puede filtrar por avanzadas', async () => {
    await service.findAll(true);
    expect(prisma.categories.findMany.mock.calls[0][0].where).toEqual({ is_active: true, is_advanced: true });
  });
});
