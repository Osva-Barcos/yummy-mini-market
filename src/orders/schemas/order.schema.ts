import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export interface OrderItem {
  productId: string;
  qty: number;
  priceCents: number;
}

@Schema({ collection: 'orders', timestamps: true })
export class Order {
  @Prop({ required: true })
  userId: string;

  @Prop({
    type: [{ productId: String, qty: Number, priceCents: Number }],
    default: [],
  })
  items: OrderItem[];

  @Prop({ required: true, default: 0 })
  totalCents: number;

  @Prop({ required: true, default: 'pending' })
  status: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
