import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { RejectQuoteDto } from './dto/reject-quote.dto';
import { OrdersService } from './orders.service';

interface AuthUser {
  userId: string;
  role: Role;
}

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create an order' })
  createOrder(
    @CurrentUser() user: AuthUser,
    @Body() payload: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(user.userId, payload);
  }

  @Get('me')
  @ApiOperation({ summary: 'List my orders' })
  listMyOrders(
    @CurrentUser('userId') userId: string,
    @Query() query: OrderQueryDto,
  ) {
    return this.ordersService.listMyOrders(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details' })
  @ApiParam({ name: 'id' })
  getOrderDetail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.ordersService.getOrderDetail(user.userId, user.role, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an order' })
  @ApiParam({ name: 'id' })
  cancelOrder(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() payload: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(userId, id, payload.reason);
  }

  @Post(':id/quote/accept')
  @ApiOperation({ summary: 'Accept custom order quote' })
  @ApiParam({ name: 'id' })
  acceptQuote(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.ordersService.acceptQuote(userId, id);
  }

  @Post(':id/quote/reject')
  @ApiOperation({ summary: 'Reject custom order quote' })
  @ApiParam({ name: 'id' })
  rejectQuote(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() payload: RejectQuoteDto,
  ) {
    return this.ordersService.rejectQuote(userId, id, payload.reason);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get a presigned download URL for the order file' })
  @ApiParam({ name: 'id' })
  download(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.ordersService.getDownloadLink(userId, id);
  }
}
