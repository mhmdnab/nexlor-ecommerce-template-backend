import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { UsersService } from './users.service';

class CustomerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}

@ApiTags('customers (admin)')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/customers')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List customers with order count + lifetime value.' })
  list(@Query() query: CustomerQueryDto) {
    return this.users.listCustomers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Customer detail with order history + addresses.' })
  get(@Param('id') id: string) {
    return this.users.getCustomer(id);
  }
}
