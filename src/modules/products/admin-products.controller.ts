import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  AdminProductQueryDto,
  BulkStatusDto,
  CreateProductDto,
  ReorderImagesDto,
  UpdateProductDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';

@ApiTags('products (admin)')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List all products (any status) for the admin table.' })
  list(@Query() query: AdminProductQueryDto) {
    return this.products.listAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by id (admin).' })
  get(@Param('id') id: string) {
    return this.products.getByIdAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a product with variants + images.' })
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a product (reconciles variants + categories).' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Patch('bulk/status')
  @ApiOperation({ summary: 'Bulk change product status.' })
  bulkStatus(@Body() dto: BulkStatusDto) {
    return this.products.bulkStatus(dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a product.' })
  remove(@Param('id') id: string) {
    return this.products.remove(id);
  }

  // ---- images ----

  @Post(':id/images')
  @ApiOperation({ summary: 'Attach an uploaded image URL to a product.' })
  addImage(@Param('id') id: string, @Body() body: { url: string; alt?: string }) {
    return this.products.addImage(id, body.url, body.alt);
  }

  @Patch(':id/images/reorder')
  @ApiOperation({ summary: 'Reorder product images.' })
  reorderImages(@Param('id') id: string, @Body() dto: ReorderImagesDto) {
    return this.products.reorderImages(id, dto);
  }

  @Delete(':id/images/:imageId')
  @ApiOperation({ summary: 'Delete a product image.' })
  deleteImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.products.deleteImage(id, imageId);
  }
}
