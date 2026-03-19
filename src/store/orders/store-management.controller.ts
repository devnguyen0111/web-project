import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { QuoteOrderDto } from './dto/quote-order.dto';
import { StoreOrderQueryDto } from './dto/store-order-query.dto';
import { StoreRevenueQueryDto } from './dto/store-revenue-query.dto';
import { UpdateStoreOrderStatusDto } from './dto/update-store-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('store-management')
@ApiBearerAuth()
@Roles(Role.STAFF, Role.ADMIN)
@Controller('store')
export class StoreManagementController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('orders')
  @ApiOperation({ summary: 'List store orders for staff/admin' })
  listStoreOrders(@Query() query: StoreOrderQueryDto) {
    return this.ordersService.listStoreOrders(query);
  }

  @Post('orders/:id/quote')
  @ApiOperation({ summary: 'Create or update quote for a custom order' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: QuoteOrderDto })
  quoteOrder(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() payload: QuoteOrderDto,
  ) {
    return this.ordersService.quoteOrder(userId, id, payload);
  }

  @Patch('orders/:id/status')
  @ApiOperation({ summary: 'Update store order status' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateStoreOrderStatusDto })
  updateOrderStatus(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() payload: UpdateStoreOrderStatusDto,
  ) {
    return this.ordersService.updateStoreOrderStatus(userId, id, payload);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Store dashboard summary and recent orders' })
  getDashboard() {
    return this.ordersService.getStoreDashboard();
  }

  @Get('dashboard/revenue')
  @ApiOperation({ summary: 'Store revenue report by date range' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getRevenue(@Query() query: StoreRevenueQueryDto) {
    return this.ordersService.getStoreRevenue(query);
  }
}
