import {
  Body,
  Controller,
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
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { ProductsService } from '../products/products.service';
import { RejectProductDto } from '../products/dto/reject-product.dto';
import { CreateOrderQuoteDto } from './dto/create-order-quote.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { UpdateStoreOrderStatusDto } from './dto/update-store-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('store-management')
@ApiBearerAuth()
@Roles(Role.STAFF, Role.ADMIN)
@Controller('store')
export class StoreManagementController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly productsService: ProductsService,
  ) {}

  @Get('orders')
  @ApiOperation({ summary: 'List all store orders (staff/admin)' })
  listOrders(@Query() query: OrderQueryDto) {
    return this.ordersService.listStoreOrders(query);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Store dashboard summary (staff/admin)' })
  dashboard() {
    return this.ordersService.getStoreDashboard();
  }

  @Get('products/pending-review')
  @ApiOperation({ summary: 'List products pending moderation review' })
  listPendingProducts(@Query() query: PaginationDto) {
    return this.productsService.listPendingReview(query);
  }

  @Post('products/:id/approve')
  @ApiOperation({ summary: 'Approve pending product' })
  approveProduct(
    @CurrentUser('userId') reviewerUserId: string,
    @Param('id', ParseObjectIdPipe) productId: string,
  ) {
    return this.productsService.approvePendingReview(productId, reviewerUserId);
  }

  @Post('products/:id/reject')
  @ApiOperation({ summary: 'Reject pending product' })
  @ApiBody({ type: RejectProductDto })
  rejectProduct(
    @CurrentUser('userId') reviewerUserId: string,
    @Param('id', ParseObjectIdPipe) productId: string,
    @Body() payload: RejectProductDto,
  ) {
    return this.productsService.rejectPendingReview(
      productId,
      reviewerUserId,
      payload.reason,
    );
  }

  @Post('orders/:id/quote')
  @ApiOperation({ summary: 'Create/update custom-order quote' })
  @ApiBody({ type: CreateOrderQuoteDto })
  createOrderQuote(
    @CurrentUser('userId') actorUserId: string,
    @Param('id', ParseObjectIdPipe) orderId: string,
    @Body() payload: CreateOrderQuoteDto,
  ) {
    return this.ordersService.createQuote(orderId, actorUserId, payload);
  }

  @Post('orders/:id/deliver')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload delivery file for order' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of order' })
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
  deliverOrder(
    @CurrentUser('userId') actorUserId: string,
    @Param('id', ParseObjectIdPipe) orderId: string,
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
    return this.ordersService.deliverOrder(orderId, actorUserId, file);
  }

  @Patch('orders/:id/status')
  @ApiOperation({ summary: 'Update store order status with strict transitions' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of order' })
  @ApiBody({ type: UpdateStoreOrderStatusDto })
  updateOrderStatus(
    @CurrentUser('userId') actorUserId: string,
    @Param('id', ParseObjectIdPipe) orderId: string,
    @Body() payload: UpdateStoreOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatusByStaff(
      orderId,
      actorUserId,
      payload,
    );
  }
}
