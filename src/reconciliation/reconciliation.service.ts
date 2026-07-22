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
    if (pending.length === 0) {
      return;
    }

    const orderIds = pending.map((order) => order._id.toString());

    // Bug 13: antes se creaba una WalletTransaction nueva en cada corrida,
    // sin chequear si ya existía una para esa orden — con el setInterval de 1seg
    // esto duplicaba registros sin parar. Fix: verificar si ya existe una tx de
    // tipo 'reconciliation' para esta orden antes de insertar (operación idempotente).
    // Hallazgo de revisión: ese chequeo se hacía con un exists() + create() por
    // orden dentro de un for (mismo patrón N+1 que Bug 14 corrigió en orders.service.ts,
    // pero nunca aplicado aquí). Fix: un solo find con $in para saber qué órdenes ya
    // están flaggeadas, y un solo insertMany para las que faltan.
    const alreadyFlagged = await this.txModel.find(
      { orderId: { $in: orderIds }, type: 'reconciliation' },
      { orderId: 1 },
    );
    const flaggedSet = new Set(alreadyFlagged.map((tx) => tx.orderId));

    const toInsert = pending.filter(
      (order) => !flaggedSet.has(order._id.toString()),
    );

    if (toInsert.length === 0) {
      return;
    }

    await this.txModel.insertMany(
      toInsert.map((order) => ({
        userId: order.userId,
        amountCents: 0,
        type: 'reconciliation',
        orderId: order._id.toString(),
      })),
    );

    for (const order of toInsert) {
      this.logger.warn(
        `Orden ${order._id.toString()} lleva tiempo en estado pending — reconciliation creada`,
      );
    }
  }
}
