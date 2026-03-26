import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AlertsModule } from '../alerts/alerts.module';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { WalletController } from './wallet.controller';
import { WalletAdminController } from './wallet.admin.controller';
import { PaymentController } from './payment.controller';
import { DepositService } from './deposit.service';
import { PaymentReturnService } from './payment-return.service';
import { WalletService } from './wallet.service';
import { PayosProvider } from './providers/payos.provider';
import { PaymentProviderManager } from './providers/payment-provider.manager';

@Module({
  imports: [
    ConfigModule,
    AlertsModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  controllers: [WalletController, WalletAdminController, PaymentController],
  providers: [
    WalletService,
    DepositService,
    PaymentReturnService,
    MongoTransactionService,
    PaymentProviderManager,
    PayosProvider,
  ],
  exports: [WalletService, MongooseModule],
})
export class WalletModule {}
