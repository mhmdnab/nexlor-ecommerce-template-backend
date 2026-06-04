import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsInt, IsString, Min, MinLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CouponsService, CreateCouponDto, UpdateCouponDto } from './coupons.service';

class ValidateCouponDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsInt()
  @Min(0)
  subtotal!: number; // cents
}

@ApiTags('coupons')
@Controller()
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Public()
  @Post('coupons/validate')
  @ApiOperation({ summary: 'Validate a coupon code against a subtotal (cents).' })
  validate(@Body() dto: ValidateCouponDto) {
    return this.coupons.validate(dto.code, dto.subtotal);
  }

  @Get('admin/coupons')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List coupons.' })
  list(@Query() query: PaginationQueryDto) {
    return this.coupons.list(query);
  }

  @Post('admin/coupons')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a coupon.' })
  create(@Body() dto: CreateCouponDto) {
    return this.coupons.create(dto);
  }

  @Put('admin/coupons/:id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a coupon.' })
  update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(id, dto);
  }

  @Delete('admin/coupons/:id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a coupon.' })
  remove(@Param('id') id: string) {
    return this.coupons.remove(id);
  }
}
