import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ParseFilePipeBuilder } from '@nestjs/common';
import { Role } from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

type AuthUser = {
  userId: string;
  role: Role;
};

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List public products' })
  listPublic(@Query() query: ProductQueryDto) {
    return this.productsService.listPublic(query);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Get('me')
  @ApiOperation({ summary: 'List products owned by current staff/admin' })
  listMine(@CurrentUser() user: AuthUser, @Query() query: PaginationDto) {
    return this.productsService.listMine(user.userId, user.role, query);
  }

  @Public()
  @Get(':identifier')
  @ApiOperation({ summary: 'Get product detail by id or slug' })
  @ApiParam({ name: 'identifier', description: 'Mongo ObjectId or slug' })
  findPublic(@Param('identifier') identifier: string) {
    return this.productsService.findPublicDetail(identifier);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create product (staff/admin)' })
  @ApiBody({ type: CreateProductDto })
  create(@CurrentUser() user: AuthUser, @Body() payload: CreateProductDto) {
    return this.productsService.create(user, payload);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Update product (staff/admin)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() payload: UpdateProductDto,
  ) {
    return this.productsService.update(user, id, payload);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Archive product (staff/admin)' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.productsService.archive(user, id);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Post(':id/file')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload digital product file' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of product' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  uploadProductFile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 200 * 1024 * 1024 })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: {
      buffer: Buffer;
      size: number;
      mimetype?: string;
      originalname?: string;
    },
  ) {
    return this.productsService.uploadDigitalAsset(user, id, file);
  }

  @ApiBearerAuth()
  @Roles(Role.STAFF, Role.ADMIN)
  @Post(':id/submit-review')
  @ApiOperation({ summary: 'Submit product for moderation review' })
  submitForReview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.productsService.submitForReview(id, user);
  }
}
