import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateVariantPresetDto,
  UpdateVariantPresetDto,
  VariantPresetsService,
} from './variant-presets.service';

@ApiTags('variant-presets')
@Controller()
export class VariantPresetsController {
  constructor(private readonly presets: VariantPresetsService) {}

  @Get('admin/variant-presets')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List variant presets (admin).' })
  list() {
    return this.presets.list();
  }

  @Post('admin/variant-presets')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a variant preset.' })
  create(@Body() dto: CreateVariantPresetDto) {
    return this.presets.create(dto);
  }

  @Put('admin/variant-presets/:id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a variant preset.' })
  update(@Param('id') id: string, @Body() dto: UpdateVariantPresetDto) {
    return this.presets.update(id, dto);
  }

  @Delete('admin/variant-presets/:id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a variant preset.' })
  remove(@Param('id') id: string) {
    return this.presets.remove(id);
  }
}
