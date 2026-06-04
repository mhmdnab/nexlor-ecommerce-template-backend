import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CouponType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Paginated, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { paginate, toOrderBy, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluateCoupon } from './coupon.math';

export class CreateCouponDto {
  @IsString()
  @MinLength(2)
  @Transform(({ value }) => String(value).toUpperCase().trim())
  code!: string;

  @IsEnum(CouponType)
  type!: CouponType;

  @ApiPropertyOptional({ description: 'PERCENT: 0–100. FIXED: cents.' })
  @IsInt()
  @Min(0)
  value!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'ISO date string.' })
  @IsOptional()
  @IsString()
  expiresAt?: string | null;

  @ApiPropertyOptional({ description: 'Minimum subtotal in cents.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minSubtotal?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  usageLimit?: number | null;
}

export class UpdateCouponDto extends CreateCouponDto {}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQueryDto): Promise<Paginated<unknown>> {
    const { skip, take } = toSkipTake(query);
    const orderBy = toOrderBy(query, ['createdAt', 'code', 'usedCount'] as const, 'createdAt');
    const [data, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({ skip, take, orderBy }),
      this.prisma.coupon.count(),
    ]);
    return paginate(data, total, query);
  }

  async create(dto: CreateCouponDto) {
    this.assertValueShape(dto);
    return this.prisma.coupon.create({
      data: {
        code: dto.code,
        type: dto.type,
        value: dto.value,
        active: dto.active ?? true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        minSubtotal: dto.minSubtotal ?? null,
        usageLimit: dto.usageLimit ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateCouponDto) {
    this.assertValueShape(dto);
    await this.ensureExists(id);
    return this.prisma.coupon.update({
      where: { id },
      data: {
        code: dto.code,
        type: dto.type,
        value: dto.value,
        active: dto.active,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        minSubtotal: dto.minSubtotal ?? null,
        usageLimit: dto.usageLimit ?? null,
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.coupon.delete({ where: { id } });
    return { success: true };
  }

  /** Validate a code against a subtotal (public, used by the cart UI). */
  async validate(code: string, subtotal: number) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase().trim() } });
    if (!coupon) return { valid: false, discount: 0, reason: 'Coupon not found.', code };
    const result = evaluateCoupon(coupon, subtotal);
    return { ...result, code: coupon.code };
  }

  private assertValueShape(dto: CreateCouponDto) {
    if (dto.type === CouponType.PERCENT && (dto.value < 0 || dto.value > 100)) {
      throw new BadRequestException('Percent coupons must have a value between 0 and 100.');
    }
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.coupon.count({ where: { id } });
    if (!exists) throw new NotFoundException('Coupon not found.');
  }
}
