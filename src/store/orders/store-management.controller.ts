import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../common/constants/roles.constant';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrderQueryDto } from './dto/order-query.dto';
import { OrdersService } from './orders.service';

@ApiTags('store-management')
@ApiBearerAuth()
@Roles(Role.STAFF, Role.ADMIN)
@Controller('store')
export class StoreManagementController {
  constructor(private readonly ordersService: OrdersService) {}

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
}
