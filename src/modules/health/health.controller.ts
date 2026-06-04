import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Liveness probe for the hosting platform's health check. Public and dependency
 * free (no DB hit) so it stays green even if the database is briefly unavailable
 * — it reports that the process is up and accepting traffic, nothing more.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe — returns ok when the API is up.' })
  check() {
    return { status: 'ok' };
  }
}
