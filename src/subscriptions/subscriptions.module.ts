import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { WalletModule } from '../wallet/wallet.module';
import {
  Transaction,
  TransactionSchema,
} from '../wallet/schemas/transaction.schema';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [
    AlertsModule,
    NotificationsModule,
    WalletModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, MongoTransactionService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
