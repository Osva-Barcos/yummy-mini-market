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
// Bug 15: faltaban índices; find({orderId, type: 'reconciliation'}) (chequeo de
// idempotencia del Bug 13) hacía full collection scan. Fix: índices para lookup
// por usuario y por orden, más el compuesto {orderId, type} que cubre esa query exacta.
WalletTransactionSchema.index({ userId: 1 });
WalletTransactionSchema.index({ orderId: 1 });
WalletTransactionSchema.index({ orderId: 1, type: 1 });
