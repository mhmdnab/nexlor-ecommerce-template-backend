import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsString, Matches, MinLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { StorageService } from './storage.service';

class PresignDto {
  @ApiProperty({ example: 'hero-shot.jpg' })
  @IsString()
  @MinLength(1)
  filename!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @Matches(/^image\/(png|jpe?g|webp|avif|gif|svg\+xml)$/, {
    message: 'Only image content types are allowed.',
  })
  contentType!: string;
}

@ApiTags('uploads')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post('presign')
  @ApiOperation({
    summary: 'Get a presigned R2 PUT URL. The browser uploads directly; the API only signs.',
  })
  presign(@Body() dto: PresignDto) {
    return this.storage.presignUpload(dto.filename, dto.contentType);
  }
}
