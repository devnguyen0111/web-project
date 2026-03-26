import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoTransactionService } from '../../common/services/mongo-transaction.service';
import { GamificationModule } from '../../gamification/gamification.module';
import { MailModule } from '../../mail/mail.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { TicketsModule } from '../../tickets/tickets.module';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { WalletModule } from '../../wallet/wallet.module';
import { ProductsModule } from '../products/products.module';
import { OrdersController } from './orders.controller';
import { OrderDeliveryEmailService } from './order-delivery-email.service';
import { OrdersPublicController } from './orders-public.controller';
import { OrdersService } from './orders.service';
import { Order, OrderSchema } from './schemas/order.schema';
import { StoreManagementController } from './store-management.controller';

@Module({
  imports: [
    WalletModule,
    ProductsModule,
    GamificationModule,
    MailModule,
    NotificationsModule,
    TicketsModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [
    OrdersController,
    OrdersPublicController,
    StoreManagementController,
  ],
  providers: [
    OrdersService,
    OrderDeliveryEmailService,
    MongoTransactionService,
  ],
  exports: [OrdersService, MongooseModule],
})
export class OrdersModule {}
