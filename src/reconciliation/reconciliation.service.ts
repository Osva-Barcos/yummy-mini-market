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

  // Bug 12: antes esto corría con setInterval(1000) en onModuleInit, ejecutando
  // la reconciliación cada segundo y solapándose si tardaba más de 1s — la BD
  // se llenaba de registros sin control. Fix: usar @Cron en vez de setInterval,
  // para integrarse con el scheduler de NestJS y evitar ejecuciones solapadas.
  // Cada minuto es suficiente para detectar órdenes que llevan tiempo sin pagarse.
  @Cron(CronExpression.EVERY_MINUTE)
  async reconcilePendingOrders(): Promise<void> {
    const pending = await this.orderModel.find({ status: 'pending' });

    for (const order of pending) {
      const orderId = order._id.toString();

      // Bug 13: antes se creaba una WalletTransaction nueva en cada corrida,
      // sin chequear si ya existía una para esa orden — con el setInterval de 1seg
      // esto duplicaba registros sin parar. Fix: verificar si ya existe una tx de
      // tipo 'reconciliation' para esta orden antes de insertar (operación idempotente).
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
