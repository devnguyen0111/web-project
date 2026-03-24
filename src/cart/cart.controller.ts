import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AUTHENTICATED_ROLES } from '../common/constants/roles.constant';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-objectid.pipe';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CheckoutCartDto } from './dto/checkout-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartService } from './cart.service';

@ApiTags('cart')
@ApiBearerAuth()
@Roles(...AUTHENTICATED_ROLES)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get my cart' })
  getMine(@CurrentUser('userId') userId: string) {
    return this.cartService.getCart(userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add item to cart' })
  @ApiBody({ type: AddCartItemDto })
  addItem(@CurrentUser('userId') userId: string, @Body() payload: AddCartItemDto) {
    return this.cartService.addItem(userId, payload);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiParam({ name: 'itemId', description: 'Mongo ObjectId of cart item' })
  updateItem(
    @CurrentUser('userId') userId: string,
    @Param('itemId', ParseObjectIdPipe) itemId: string,
    @Body() payload: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(userId, itemId, payload);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove cart item' })
  @ApiParam({ name: 'itemId', description: 'Mongo ObjectId of cart item' })
  removeItem(
    @CurrentUser('userId') userId: string,
    @Param('itemId', ParseObjectIdPipe) itemId: string,
  ) {
    return this.cartService.removeItem(userId, itemId);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear my cart' })
  clear(@CurrentUser('userId') userId: string) {
    return this.cartService.clearCart(userId);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Checkout cart' })
  @ApiBody({ type: CheckoutCartDto })
  checkout(
    @CurrentUser('userId') userId: string,
    @Body() payload: CheckoutCartDto,
  ) {
    return this.cartService.checkout(userId, payload);
  }
}
