import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardService, Granularity } from './dashboard.service';

class OverviewQueryDto {
  @ApiPropertyOptional({ default: 30, description: 'Window size in days.' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(365)
  days = 30;

  @ApiPropertyOptional({ enum: ['day', 'week', 'month'], default: 'day' })
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  granularity: Granularity = 'day';
}

@ApiTags('dashboard (admin)')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Stat cards, revenue series, status breakdown, top products, low stock.' })
  overview(@Query() query: OverviewQueryDto) {
    return this.dashboard.overview(query.days, query.granularity);
  }

  @Get('recent-orders')
  @ApiOperation({ summary: 'Most recent orders for the overview table.' })
  recentOrders() {
    return this.dashboard.recentOrders();
  }
}
