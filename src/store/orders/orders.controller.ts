import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AUTHENTICATED_ROLES, Role } from '../../common/constants/roles.constant';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
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
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create direct order (buy-now)' })
  @ApiBody({ type: CreateOrderDto })
  create(
    @CurrentUser('userId') userId: string,
    @Body() payload: CreateOrderDto,
  ) {
    return this.ordersService.createDirectOrder(userId, payload);
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
  detail(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.ordersService.getOrderForUser(id, user);
  }
}
