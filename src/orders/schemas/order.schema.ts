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

  @Prop()
  idempotencyKey?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
// Bug 15: no había índices sobre los campos usados en queries frecuentes,
// causando full collection scan en la reconciliación (find({status:'pending'})
// corre cada minuto). Fix: índices para filtro por usuario y por estado.
OrderSchema.index({ userId: 1 });
OrderSchema.index({ status: 1 });
// Hallazgo de revisión: dedupe de POST /orders. Único y sparse para que solo
// aplique cuando el cliente manda idempotencyKey (no afecta órdenes sin ella).
OrderSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true },
);
