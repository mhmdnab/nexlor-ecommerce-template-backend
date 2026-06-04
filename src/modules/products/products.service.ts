import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { Paginated } from '../../common/dto/pagination.dto';
import { paginate, toOrderBy, toSkipTake } from '../../common/pagination';
import { slugify } from '../../common/slug';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminProductQueryDto,
  BulkStatusDto,
  CreateProductDto,
  ProductQueryDto,
  ReorderImagesDto,
  UpdateProductDto,
} from './dto/product.dto';

const productInclude = {
  variants: { orderBy: { position: 'asc' } },
  images: { orderBy: { position: 'asc' } },
  categories: { include: { category: true } },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

const SORTABLE = ['createdAt', 'name', 'basePrice'] as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- mappers ----

  /** Effective price = lowest variant price, falling back to basePrice. */
  private effectivePrice(p: ProductWithRelations): number {
    const prices = p.variants
      .map((v) => v.priceOverride ?? p.basePrice)
      .filter((n): n is number => typeof n === 'number');
    return prices.length ? Math.min(...prices) : p.basePrice;
  }

  toCard(p: ProductWithRelations) {
    const totalStock = p.variants.reduce((s, v) => s + v.stock, 0);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      price: this.effectivePrice(p),
      image: p.images[0]?.url ?? null,
      imageAlt: p.images[0]?.alt ?? p.name,
      inStock: totalStock > 0,
      lowStock: totalStock > 0 && totalStock <= 5,
      isNew: Date.now() - p.createdAt.getTime() < 1000 * 60 * 60 * 24 * 30,
      categorySlugs: p.categories.map((c) => c.category.slug),
      status: p.status,
    };
  }

  toDetail(p: ProductWithRelations) {
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      basePrice: p.basePrice,
      price: this.effectivePrice(p),
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      images: p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, position: i.position })),
      variants: p.variants.map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        price: v.priceOverride ?? p.basePrice,
        priceOverride: v.priceOverride,
        stock: v.stock,
        inStock: v.stock > 0,
      })),
      categories: p.categories.map((c) => ({ id: c.category.id, slug: c.category.slug, name: c.category.name })),
    };
  }

  // ---- shared filtering ----

  private buildWhere(query: ProductQueryDto, status?: ProductStatus): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {};
    if (status) where.status = status;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.category) {
      where.categories = { some: { category: { slug: query.category } } };
    }
    if (query.minPrice != null || query.maxPrice != null) {
      where.basePrice = {};
      if (query.minPrice != null) where.basePrice.gte = query.minPrice;
      if (query.maxPrice != null) where.basePrice.lte = query.maxPrice;
    }
    return where;
  }

  // ---- public ----

  async listPublic(query: ProductQueryDto): Promise<Paginated<ReturnType<ProductsService['toCard']>>> {
    const where = this.buildWhere(query, ProductStatus.ACTIVE);
    const { skip, take } = toSkipTake(query);
    const orderBy = toOrderBy(query, SORTABLE, 'createdAt');

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: productInclude, skip, take, orderBy }),
      this.prisma.product.count({ where }),
    ]);
    return paginate(rows.map((p) => this.toCard(p)), total, query);
  }

  async getBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Product not found.');
    return this.toDetail(product);
  }

  async related(slug: string, limit = 4) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: { categories: true },
    });
    if (!product) return [];
    const categoryIds = product.categories.map((c) => c.categoryId);
    const rows = await this.prisma.product.findMany({
      where: {
        status: ProductStatus.ACTIVE,
        id: { not: product.id },
        categories: { some: { categoryId: { in: categoryIds } } },
      },
      include: productInclude,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((p) => this.toCard(p));
  }

  // ---- admin ----

  async listAdmin(query: AdminProductQueryDto) {
    const where = this.buildWhere(query, query.status);
    const { skip, take } = toSkipTake(query);
    const orderBy = toOrderBy(query, SORTABLE, 'createdAt');
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: productInclude, skip, take, orderBy }),
      this.prisma.product.count({ where }),
    ]);
    return paginate(rows.map((p) => this.toDetail(p)), total, query);
  }

  async getByIdAdmin(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!product) throw new NotFoundException('Product not found.');
    return this.toDetail(product);
  }

  async create(dto: CreateProductDto) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    const variants = dto.variants?.length
      ? dto.variants
      : [{ name: 'Default', sku: `${slug}-default`, stock: 0, priceOverride: null }];

    const created = await this.prisma.product.create({
      data: {
        slug,
        name: dto.name,
        description: dto.description,
        basePrice: dto.basePrice,
        status: dto.status ?? ProductStatus.DRAFT,
        variants: {
          create: variants.map((v, i) => ({
            name: v.name,
            sku: v.sku,
            priceOverride: v.priceOverride ?? null,
            stock: v.stock,
            position: i,
          })),
        },
        images: {
          create: (dto.images ?? []).map((img, i) => ({ url: img.url, alt: img.alt ?? '', position: i })),
        },
        categories: { create: (dto.categoryIds ?? []).map((categoryId) => ({ categoryId })) },
      },
      include: productInclude,
    });
    return this.toDetail(created);
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.ensureExists(id);

    // Reconcile variants: update existing (by id), create new, delete removed.
    const incomingVariants = dto.variants ?? [];
    const keepIds = incomingVariants.filter((v) => v.id).map((v) => v.id as string);

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug ? slugify(dto.slug) : undefined,
          description: dto.description,
          basePrice: dto.basePrice,
          status: dto.status,
        },
      });

      if (dto.variants) {
        await tx.productVariant.deleteMany({ where: { productId: id, id: { notIn: keepIds.length ? keepIds : ['__none__'] } } });
        for (const [i, v] of incomingVariants.entries()) {
          if (v.id) {
            await tx.productVariant.update({
              where: { id: v.id },
              data: { name: v.name, sku: v.sku, priceOverride: v.priceOverride ?? null, stock: v.stock, position: i },
            });
          } else {
            await tx.productVariant.create({
              data: { productId: id, name: v.name, sku: v.sku, priceOverride: v.priceOverride ?? null, stock: v.stock, position: i },
            });
          }
        }
      }

      if (dto.categoryIds) {
        await tx.productCategory.deleteMany({ where: { productId: id } });
        await tx.productCategory.createMany({ data: dto.categoryIds.map((categoryId) => ({ productId: id, categoryId })) });
      }

      // Reconcile images: keep incoming (by id), create new, delete removed.
      if (dto.images) {
        const keepImageIds = dto.images.filter((img) => img.id).map((img) => img.id as string);
        await tx.productImage.deleteMany({
          where: { productId: id, id: { notIn: keepImageIds.length ? keepImageIds : ['__none__'] } },
        });
        for (const [i, img] of dto.images.entries()) {
          if (img.id) {
            await tx.productImage.update({ where: { id: img.id }, data: { url: img.url, alt: img.alt ?? '', position: i } });
          } else {
            await tx.productImage.create({ data: { productId: id, url: img.url, alt: img.alt ?? '', position: i } });
          }
        }
      }
    });

    return this.getByIdAdmin(id);
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.product.delete({ where: { id } });
    return { success: true };
  }

  async bulkStatus(dto: BulkStatusDto) {
    const result = await this.prisma.product.updateMany({
      where: { id: { in: dto.ids } },
      data: { status: dto.status },
    });
    return { updated: result.count };
  }

  // ---- images ----

  async addImage(productId: string, url: string, alt = '') {
    await this.ensureExists(productId);
    const count = await this.prisma.productImage.count({ where: { productId } });
    const image = await this.prisma.productImage.create({
      data: { productId, url, alt, position: count },
    });
    return image;
  }

  async reorderImages(productId: string, dto: ReorderImagesDto) {
    await this.ensureExists(productId);
    await this.prisma.$transaction(
      dto.imageIds.map((imageId, position) =>
        this.prisma.productImage.update({ where: { id: imageId }, data: { position } }),
      ),
    );
    return this.getByIdAdmin(productId);
  }

  async deleteImage(productId: string, imageId: string) {
    await this.ensureExists(productId);
    await this.prisma.productImage.delete({ where: { id: imageId } });
    return { success: true };
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.product.count({ where: { id } });
    if (!exists) throw new NotFoundException('Product not found.');
  }
}
