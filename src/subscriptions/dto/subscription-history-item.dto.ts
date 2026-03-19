import { BillingCycle } from '../subscription.constants';
import {
  TransactionStatus,
  TransactionType,
} from '../../wallet/schemas/transaction.schema';

export class SubscriptionHistoryItemDto {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  planCode?: string;
  billingCycle: BillingCycle;
  totalCostCoins?: number | null;
  months?: number | null;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}
