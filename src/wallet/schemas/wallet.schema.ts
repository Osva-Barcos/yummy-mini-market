import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WalletDocument = HydratedDocument<Wallet>;

@Schema({ collection: 'wallets' })
export class Wallet {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ required: true, default: 0 })
  balanceCents: number;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
