import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post as HttpPost,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductsQueryDto } from './dto/products-query.dto';
import { RejectProductDto } from './dto/reject-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

interface AuthUser {
  userId: string;
  role: Role;
}

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List public products' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['digital', 'custom_order'] })
  @ApiQuery({ name: 'categoryId', required: false })
  listPublic(@Query() query: ProductsQueryDto) {
    return this.productsService.listPublic(query);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Get('me')
  @ApiOperation({ summary: 'List my products (staff/admin)' })
  listMine(@CurrentUser() user: AuthUser, @Query() query: ProductsQueryDto) {
    return this.productsService.listMine(user.userId, query);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get public product by slug' })
  @ApiParam({ name: 'slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.productsService.findPublicBySlug(slug);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @HttpPost()
  @ApiOperation({ summary: 'Create product (staff/admin)' })
  @ApiBody({ type: CreateProductDto })
  create(@CurrentUser('userId') userId: string, @Body() payload: CreateProductDto) {
    return this.productsService.createProduct(userId, payload);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Update product (staff/admin)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateProductDto })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() payload: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(id, payload);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @HttpPost(':id/submit-review')
  @ApiOperation({ summary: 'Submit product for review (staff/admin)' })
  @ApiParam({ name: 'id' })
  submitForReview(@Param('id', ParseObjectIdPipe) id: string) {
    return this.productsService.submitForReview(id);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @HttpPost(':id/publish')
  @ApiOperation({ summary: 'Publish product (staff/admin)' })
  @ApiParam({ name: 'id' })
  publish(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.productsService.publish(id, userId);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @HttpPost(':id/reject')
  @ApiOperation({ summary: 'Reject product (staff/admin)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: RejectProductDto })
  reject(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Body() payload: RejectProductDto,
  ) {
    return this.productsService.reject(id, userId, payload);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Archive product (staff/admin)' })
  @ApiParam({ name: 'id' })
  archive(@Param('id', ParseObjectIdPipe) id: string) {
    return this.productsService.archive(id);
  }
}
