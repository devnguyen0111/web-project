import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoTransactionService } from '../../common/services/mongo-transaction.service';
import { WalletModule } from '../../wallet/wallet.module';
import { ProductsModule } from '../products/products.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order, OrderSchema } from './schemas/order.schema';
import { StoreManagementController } from './store-management.controller';

@Module({
  imports: [
    WalletModule,
    ProductsModule,
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
  ],
  controllers: [OrdersController, StoreManagementController],
  providers: [OrdersService, MongoTransactionService],
  exports: [OrdersService, MongooseModule],
})
export class OrdersModule {}
