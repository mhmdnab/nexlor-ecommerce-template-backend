import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CategoriesService, CreateCategoryDto, UpdateCategoryDto } from './categories.service';

@ApiTags('categories')
@Controller()
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Public nested category tree with product counts.' })
  tree() {
    return this.categories.tree();
  }

  @Get('admin/categories')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin category tree (same shape).' })
  adminTree() {
    return this.categories.tree();
  }

  @Post('admin/categories')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a category.' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Put('admin/categories/:id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a category.' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete('admin/categories/:id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a category (children re-parent to root).' })
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
