import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MinioModule } from '../../minio/minio.module';
import { MongoTransactionService } from '../../common/services/mongo-transaction.service';
import { WalletModule } from '../../wallet/wallet.module';
import { ProductsModule } from '../products/products.module';
import { Order, OrderSchema } from './schemas/order.schema';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { StoreManagementController } from './store-management.controller';

@Module({
  imports: [
    WalletModule,
    MinioModule,
    ProductsModule,
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
  ],
  controllers: [OrdersController, StoreManagementController],
  providers: [OrdersService, MongoTransactionService],
  exports: [OrdersService, MongooseModule],
})
export class OrdersModule {}
