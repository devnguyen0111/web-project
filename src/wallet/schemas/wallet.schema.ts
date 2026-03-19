import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export interface WalletState {
  balance: number;
  frozenBalance: number;
  totalEarned: number;
  totalSpent: number;
  lifetimeDeposit: number;
}

export const createDefaultWallet = (): WalletState => ({
  balance: 0,
  frozenBalance: 0,
  totalEarned: 0,
  totalSpent: 0,
  lifetimeDeposit: 0,
});

@Schema({ _id: false })
export class Wallet {
  @Prop({ default: 0, min: 0 })
  balance: number;

  @Prop({ default: 0, min: 0 })
  frozenBalance: number;

  @Prop({ default: 0, min: 0 })
  totalEarned: number;

  @Prop({ default: 0, min: 0 })
  totalSpent: number;

  @Prop({ default: 0, min: 0 })
  lifetimeDeposit: number;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
