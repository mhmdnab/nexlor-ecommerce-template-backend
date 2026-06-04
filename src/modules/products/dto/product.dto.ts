import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/** Public catalog query: search, category, price range, sort. */
export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Full-text-ish search over name/description.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Category slug filter.' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Minimum price in cents.' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price in cents.' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  maxPrice?: number;
}

/** Admin query adds status filtering (public list is always ACTIVE-only). */
export class AdminProductQueryDto extends ProductQueryDto {
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}

export class VariantInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string; // present => update existing, absent => create

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiPropertyOptional({ description: 'Override price in cents; null = use basePrice.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceOverride?: number | null;

  @IsInt()
  @Min(0)
  stock!: number;
}

export class ImageInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  alt?: string;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ description: 'URL slug; auto-generated from name if omitted.' })
  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  description!: string;

  @ApiPropertyOptional({ description: 'Base price in cents.' })
  @IsInt()
  @Min(0)
  basePrice!: number;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.DRAFT })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ type: [String], description: 'Category ids.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ type: [VariantInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants?: VariantInputDto[];

  @ApiPropertyOptional({ type: [ImageInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageInputDto)
  images?: ImageInputDto[];
}

export class UpdateProductDto extends CreateProductDto {}

export class BulkStatusDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];

  @IsEnum(ProductStatus)
  status!: ProductStatus;
}

export class ReorderImagesDto {
  @IsArray()
  @IsString({ each: true })
  imageIds!: string[]; // new order
}
