import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import { OrdersModule } from '../store/orders/orders.module';
import { ProductsModule } from '../store/products/products.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { Cart, CartSchema } from './schemas/cart.schema';

@Module({
  imports: [
    ProductsModule,
    OrdersModule,
    MongooseModule.forFeature([{ name: Cart.name, schema: CartSchema }]),
  ],
  controllers: [CartController],
  providers: [CartService, MongoTransactionService],
  exports: [CartService, MongooseModule],
})
export class CartModule {}
