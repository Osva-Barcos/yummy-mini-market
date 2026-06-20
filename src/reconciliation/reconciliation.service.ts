import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import {
  WalletTransaction,
  WalletTransactionDocument,
} from '../wallet/schemas/wallet-transaction.schema';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(WalletTransaction.name)
    private readonly txModel: Model<WalletTransactionDocument>,
  ) {}

  // Fix: usar @Cron en vez de setInterval para integrarse con el scheduler de NestJS
  // y evitar ejecuciones solapadas. Cada minuto es suficiente para detectar órdenes
  // que llevan tiempo sin pagarse.
  @Cron(CronExpression.EVERY_MINUTE)
  async reconcilePendingOrders(): Promise<void> {
    const pending = await this.orderModel.find({ status: 'pending' });

    for (const order of pending) {
      const orderId = order._id.toString();

      // Fix idempotencia: solo crear la tx si todavía no existe una para esta orden.
      // Previene la acumulación infinita de registros duplicados.
      const alreadyFlagged = await this.txModel.exists({
        orderId,
        type: 'reconciliation',
      });

      if (!alreadyFlagged) {
        await this.txModel.create({
          userId: order.userId,
          amountCents: 0,
          type: 'reconciliation',
          orderId,
        });
        this.logger.warn(
          `Orden ${orderId} lleva tiempo en estado pending — reconciliation creada`,
        );
      }
    }
  }
}
