import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { slugify } from '../../common/slug';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ description: 'Parent category id for nesting.' })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  position?: number;
}

export class UpdateCategoryDto extends CreateCategoryDto {}

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  position: number;
  productCount: number;
  children: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Full nested tree with product counts. */
  async tree(): Promise<CategoryNode[]> {
    const cats = await this.prisma.category.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    const byId = new Map<string, CategoryNode>();
    for (const c of cats) {
      byId.set(c.id, {
        id: c.id,
        slug: c.slug,
        name: c.name,
        parentId: c.parentId,
        position: c.position,
        productCount: c._count.products,
        children: [],
      });
    }
    const roots: CategoryNode[] = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async create(dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug ? slugify(dto.slug) : slugify(dto.name),
        parentId: dto.parentId ?? null,
        position: dto.position ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    if (dto.parentId === id) throw new BadRequestException('A category cannot be its own parent.');
    await this.ensureExists(id);
    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug ? slugify(dto.slug) : undefined,
        parentId: dto.parentId === undefined ? undefined : dto.parentId,
        position: dto.position,
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    // Children are re-parented to null via onDelete: SetNull at the DB level.
    await this.prisma.category.delete({ where: { id } });
    return { success: true };
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.category.count({ where: { id } });
    if (!exists) throw new NotFoundException('Category not found.');
  }
}
