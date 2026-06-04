import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsObject, IsOptional } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  BrandingSettings,
  CommerceSettings,
  SettingsService,
  ShippingSettings,
} from './settings.service';

class UpdateSettingsDto {
  @IsOptional()
  @IsObject()
  branding?: BrandingSettings;

  @IsOptional()
  @IsObject()
  commerce?: CommerceSettings;

  @IsOptional()
  @IsObject()
  shipping?: ShippingSettings;
}

@ApiTags('settings')
@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('settings')
  @ApiOperation({ summary: 'Public store settings (branding, currency, shipping/tax).' })
  getPublic() {
    return this.settings.getAll();
  }

  @Get('admin/settings')
  @ApiBearerAuth()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all settings (SUPER_ADMIN).' })
  getAdmin() {
    return this.settings.getAll();
  }

  @Put('admin/settings')
  @ApiBearerAuth()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update store settings (SUPER_ADMIN only).' })
  async update(@Body() dto: UpdateSettingsDto) {
    if (dto.branding) await this.settings.update('branding', dto.branding);
    if (dto.commerce) await this.settings.update('commerce', dto.commerce);
    if (dto.shipping) await this.settings.update('shipping', dto.shipping);
    return this.settings.getAll();
  }
}
