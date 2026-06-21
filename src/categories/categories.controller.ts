import { Controller, Get, Query } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(@Query('advanced') advanced?: string) {
    const advancedFilter = advanced === undefined ? undefined : advanced === 'true';
    return this.categoriesService.findAll(advancedFilter);
  }
} 