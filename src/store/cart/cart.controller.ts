import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartCheckoutDto } from './dto/cart-checkout.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartService } from './cart.service';

@ApiTags('cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my cart' })
  getMyCart(@CurrentUser('userId') userId: string) {
    return this.cartService.getMyCart(userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add item to cart' })
  addItem(
    @CurrentUser('userId') userId: string,
    @Body() payload: AddCartItemDto,
  ) {
    return this.cartService.addItem(userId, payload);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Update cart item' })
  @ApiParam({ name: 'id' })
  updateItem(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseObjectIdPipe) itemId: string,
    @Body() payload: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(userId, itemId, payload);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiParam({ name: 'id' })
  removeItem(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseObjectIdPipe) itemId: string,
  ) {
    return this.cartService.removeItem(userId, itemId);
  }

  @Post('me/clear')
  @ApiOperation({ summary: 'Clear my cart' })
  clearMyCart(@CurrentUser('userId') userId: string) {
    return this.cartService.clearMyCart(userId);
  }

  @Post('me/checkout')
  @ApiOperation({ summary: 'Checkout my cart or a subset of items' })
  checkout(
    @CurrentUser('userId') userId: string,
    @Body() payload: CartCheckoutDto,
  ) {
    return this.cartService.checkout(userId, payload);
  }
}
