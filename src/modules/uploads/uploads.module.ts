import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { R2StorageService, StorageService } from './storage.service';

@Module({
  controllers: [UploadsController],
  // Bind the abstract StorageService token to the R2 implementation. Swap this
  // line to change providers — nothing else in the app needs to change.
  providers: [{ provide: StorageService, useClass: R2StorageService }],
  exports: [StorageService],
})
export class UploadsModule {}
