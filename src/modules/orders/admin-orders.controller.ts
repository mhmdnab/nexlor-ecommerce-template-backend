import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminOrderQueryDto, UpdateOrderStatusDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders (admin)')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List/filter orders (status, search) with pagination.' })
  list(@Query() query: AdminOrderQueryDto) {
    return this.orders.listAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Order detail with line items + totals + address.' })
  get(@Param('id') id: string) {
    return this.orders.getAdmin(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status (PENDING/PAID/FULFILLED/CANCELLED/REFUNDED).' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.updateStatus(id, dto.status);
  }
}
