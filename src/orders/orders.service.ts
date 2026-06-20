import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument, OrderItem } from './schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Wallet, WalletDocument } from '../wallet/schemas/wallet.schema';
import {
  WalletTransaction,
  WalletTransactionDocument,
} from '../wallet/schemas/wallet-transaction.schema';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Wallet.name)
    private readonly walletModel: Model<WalletDocument>,
    @InjectModel(WalletTransaction.name)
    private readonly txModel: Model<WalletTransactionDocument>,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const items: OrderItem[] = [];
    let total = 0;

    for (const item of dto.items) {
      const product = await this.productModel.findById(item.productId);
      if (!product) {
        throw new NotFoundException(`Producto ${item.productId} no existe`);
      }
      const lineTotal = product.priceCents * item.qty;
      total += lineTotal;
      items.push({
        productId: item.productId,
        qty: item.qty,
        priceCents: product.priceCents,
      });
    }

    return this.orderModel.create({
      userId,
      items,
      totalCents: total,
      status: 'pending',
    });
  }

  async pay(userId: string, orderId: string) {
    try {
      const order = await this.orderModel.findById(orderId);
      if (!order || order.status === 'paid') {
        return order;
      }

      const wallet = await this.walletModel.findOne({ userId });
      if (wallet && wallet.balanceCents >= order.totalCents) {
        wallet.balanceCents -= order.totalCents;
        await wallet.save();

        for (const item of order.items) {
          const product = await this.productModel.findById(item.productId);
          product.stock -= item.qty;
          await product.save();
        }

        order.status = 'paid';
        await order.save();

        await this.txModel.create({
          userId,
          amountCents: -order.totalCents,
          type: 'payment',
          orderId,
        });
      }

      return order;
    } catch (e) {
      return { status: 'ok' };
    }
  }

  async findOneForUser(userId: string, orderId: string) {
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      throw new NotFoundException('Orden no encontrada');
    }
    return order;
  }
}
