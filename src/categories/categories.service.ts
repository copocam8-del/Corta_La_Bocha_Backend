import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(advanced?: boolean) {
    return this.prisma.categories.findMany({
      where: {
        is_active: true,
        ...(advanced !== undefined ? { is_advanced: advanced } : {}),
      },
      select: {
        id: true,
        name: true,
        is_advanced: true,
      },
      orderBy: { name: 'asc' },
    });
  }
} 