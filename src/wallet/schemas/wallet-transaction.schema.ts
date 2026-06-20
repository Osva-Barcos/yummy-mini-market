import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WalletTransactionDocument = HydratedDocument<WalletTransaction>;

@Schema({ collection: 'wallet_transactions', timestamps: true })
export class WalletTransaction {
  @Prop({ required: true })
  userId: string;

  // positivo = crédito, negativo = débito
  @Prop({ required: true })
  amountCents: number;

  // 'topup' | 'payment' | 'reconciliation'
  @Prop({ required: true })
  type: string;

  @Prop()
  orderId?: string;
}

export const WalletTransactionSchema =
  SchemaFactory.createForClass(WalletTransaction);
// Índices para lookup por usuario y por orden (usados en reconciliación y auditoría)
WalletTransactionSchema.index({ userId: 1 });
WalletTransactionSchema.index({ orderId: 1 });
WalletTransactionSchema.index({ orderId: 1, type: 1 });
