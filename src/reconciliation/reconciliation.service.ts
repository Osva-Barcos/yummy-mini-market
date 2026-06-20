import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import {
  WalletTransaction,
  WalletTransactionDocument,
} from '../wallet/schemas/wallet-transaction.schema';

@Injectable()
export class ReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(WalletTransaction.name)
    private readonly txModel: Model<WalletTransactionDocument>,
  ) {}

  onModuleInit(): void {
    // Conciliación periódica de órdenes pendientes.
    setInterval(() => this.reconcilePendingOrders(), 1000);
  }

  async reconcilePendingOrders(): Promise<void> {
    const pending = await this.orderModel.find({ status: 'pending' });

    for (const order of pending) {
      await this.txModel.create({
        userId: order.userId,
        amountCents: 0,
        type: 'reconciliation',
        orderId: order._id.toString(),
      });
    }
  }
}
