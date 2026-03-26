import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
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
import {
  AUTHENTICATED_ROLES,
  Role,
} from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { TicketsService } from '../../tickets/tickets.service';
import { ProductType } from '../products/schemas/product.schema';
import { AcceptOrderQuoteDto } from './dto/accept-order-quote.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { RejectOrderQuoteDto } from './dto/reject-order-quote.dto';
import { RequestOrderActionDto } from './dto/request-order-action.dto';
import { OrdersService } from './orders.service';

type AuthUser = {
  userId: string;
  role: Role;
};

@ApiTags('orders')
@ApiBearerAuth()
@Roles(...AUTHENTICATED_ROLES)
@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly ticketsService: TicketsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create direct order (buy-now/custom-request)' })
  @ApiBody({ type: CreateOrderDto })
  async create(
    @CurrentUser('userId') userId: string,
    @Body() payload: CreateOrderDto,
  ) {
    const order = await this.ordersService.createDirectOrder(userId, payload);

    const isCustomOrder = order.items.some(
      (item) => item.productType === ProductType.CUSTOM_ORDER,
    );
    if (isCustomOrder) {
      try {
        await this.ticketsService.ensureCustomOrderTicketForOrder({
          orderId: order.id,
          orderNumber: order.orderNumber,
          buyerId: userId,
          sellerId: order.sellerId?.toString(),
          customData: payload.customData,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to bootstrap custom-order ticket for order=${order.id}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }

    return order;
  }

  @Get('me')
  @ApiOperation({ summary: 'List my orders' })
  listMine(
    @CurrentUser('userId') userId: string,
    @Query() query: OrderQueryDto,
  ) {
    return this.ordersService.listMyOrders(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order detail' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of order' })
  detail(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.getOrderForUser(id, user);
  }

  @Post(':id/quote/accept')
  @ApiOperation({ summary: 'Accept custom-order quote (buyer)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of order' })
  @ApiBody({ type: AcceptOrderQuoteDto })
  acceptQuote(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Body() payload: AcceptOrderQuoteDto,
  ) {
    return this.ordersService.acceptQuote(id, userId, payload);
  }

  @Post(':id/quote/reject')
  @ApiOperation({ summary: 'Reject custom-order quote (buyer)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of order' })
  @ApiBody({ type: RejectOrderQuoteDto })
  rejectQuote(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Body() payload: RejectOrderQuoteDto,
  ) {
    return this.ordersService.rejectQuote(id, userId, payload);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete delivered order (buyer)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of order' })
  completeOrder(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.ordersService.completeByBuyer(id, userId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Request order cancellation (buyer, request-only)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of order' })
  @ApiBody({ type: RequestOrderActionDto, required: false })
  requestCancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Body() payload: RequestOrderActionDto,
  ) {
    return this.ordersService.requestCancelByBuyer(id, userId, payload);
  }

  @Post(':id/refund-request')
  @ApiOperation({ summary: 'Request refund (buyer, request-only)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of order' })
  @ApiBody({ type: RequestOrderActionDto, required: false })
  requestRefund(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Body() payload: RequestOrderActionDto,
  ) {
    return this.ordersService.requestRefundByBuyer(id, userId, payload);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get secure download link for delivered files' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of order' })
  @ApiQuery({ name: 'fileId', required: false })
  download(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query('fileId') fileId?: string,
  ) {
    return this.ordersService.getOrderDownloadLink(id, user, fileId);
  }
}
