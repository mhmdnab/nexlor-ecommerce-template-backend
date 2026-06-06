import { Module } from '@nestjs/common';
import { VariantPresetsController } from './variant-presets.controller';
import { VariantPresetsService } from './variant-presets.service';

@Module({
  controllers: [VariantPresetsController],
  providers: [VariantPresetsService],
})
export class VariantPresetsModule {}
