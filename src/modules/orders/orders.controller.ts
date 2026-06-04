import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CartSessionService } from '../cart/cart-session.service';
import { AdminOrderQueryDto, CheckoutDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('checkout & orders')
@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly session: CartSessionService,
  ) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('checkout')
  @ApiOperation({ summary: 'Create an order from the current cart (server recomputes totals + stock).' })
  async checkout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() dto: CheckoutDto) {
    const { identity, userId } = await this.session.resolve(req, res);
    return this.orders.checkout(identity, userId, dto);
  }

  @Public()
  @Post('orders/:id/pay')
  @ApiOperation({ summary: 'Stubbed payment — marks the order PAID. // TODO: real PSP.' })
  pay(@Param('id') id: string) {
    return this.orders.pay(id);
  }

  @Public()
  @Get('orders/:orderNumber')
  @ApiOperation({ summary: 'Look up an order by its number (confirmation page).' })
  getByNumber(@Param('orderNumber') orderNumber: string) {
    return this.orders.getByNumber(orderNumber);
  }

  // ---- authenticated customer history ----

  @ApiBearerAuth()
  @Get('account/orders')
  @ApiOperation({ summary: 'List the signed-in customer’s orders.' })
  myOrders(@CurrentUser() user: AuthUser, @Query() query: AdminOrderQueryDto) {
    return this.orders.listForUser(user.id, query);
  }

  @ApiBearerAuth()
  @Get('account/orders/:orderNumber')
  @ApiOperation({ summary: 'Get one of the signed-in customer’s orders.' })
  myOrder(@CurrentUser() user: AuthUser, @Param('orderNumber') orderNumber: string) {
    return this.orders.getForUser(user.id, orderNumber);
  }
}
