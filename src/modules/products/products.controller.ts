import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ProductQueryDto } from './dto/product.dto';
import { ProductsService } from './products.service';

@ApiTags('products (public)')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List ACTIVE products with filter/search/sort/pagination.' })
  list(@Query() query: ProductQueryDto) {
    return this.products.listPublic(query);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get a single ACTIVE product by slug.' })
  getBySlug(@Param('slug') slug: string) {
    return this.products.getBySlug(slug);
  }

  @Public()
  @Get(':slug/related')
  @ApiOperation({ summary: 'Related products in the same categories.' })
  related(@Param('slug') slug: string) {
    return this.products.related(slug);
  }
}
