import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { IsInt, IsString, Min, MinLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CartSessionService } from './cart-session.service';
import { CartService } from './cart.service';

class AddItemDto {
  @IsString()
  @MinLength(1)
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

class UpdateItemDto {
  @IsInt()
  @Min(0)
  quantity!: number;
}

class ApplyCouponDto {
  @IsString()
  @MinLength(2)
  code!: string;
}

@ApiTags('cart')
@Public()
@UseGuards(OptionalJwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly session: CartSessionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the current cart (guest or user) with computed totals.' })
  async get(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { identity } = await this.session.resolve(req, res);
    return this.cart.view(identity);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add a variant to the cart.' })
  async add(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() dto: AddItemDto) {
    const { identity } = await this.session.resolve(req, res);
    return this.cart.addItem(identity, dto.variantId, dto.quantity);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update a line item quantity (0 removes it).' })
  async update(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    const { identity } = await this.session.resolve(req, res);
    return this.cart.updateItem(identity, itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove a line item.' })
  async remove(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('itemId') itemId: string,
  ) {
    const { identity } = await this.session.resolve(req, res);
    return this.cart.removeItem(identity, itemId);
  }

  @Post('coupon')
  @ApiOperation({ summary: 'Apply a coupon code to the cart.' })
  async applyCoupon(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: ApplyCouponDto,
  ) {
    const { identity } = await this.session.resolve(req, res);
    return this.cart.applyCoupon(identity, dto.code);
  }

  @Delete('coupon')
  @ApiOperation({ summary: 'Remove the applied coupon.' })
  async removeCoupon(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { identity } = await this.session.resolve(req, res);
    return this.cart.removeCoupon(identity);
  }
}
