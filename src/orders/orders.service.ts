import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
    // Fix N+1: batch-fetch all products in a single query
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.productModel.find({ _id: { $in: productIds } });
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const items: OrderItem[] = [];
    let total = 0;

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
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
    const order = await this.orderModel.findById(orderId);

    // Fix IDOR: verify the order belongs to the requesting user
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Orden no encontrada');
    }

    if (order.status === 'paid') {
      return order;
    }

    // Fix race condition + saldo insuficiente: check-and-decrement atómico.
    // findOneAndUpdate con $gte garantiza que solo descuenta si hay saldo suficiente
    // y lo hace en una sola operación de escritura → safe ante pagos concurrentes.
    const wallet = await this.walletModel.findOneAndUpdate(
      { userId, balanceCents: { $gte: order.totalCents } },
      { $inc: { balanceCents: -order.totalCents } },
      { new: true },
    );

    if (!wallet) {
      throw new BadRequestException('Saldo insuficiente');
    }

    // Fix N+1 en pay: batch-fetch todos los productos del pedido en una sola query
    const productIds = order.items.map((i) => i.productId);
    const products = await this.productModel.find({ _id: { $in: productIds } });
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    // Fix oversell: verificar stock antes de descontar
    for (const item of order.items) {
      const product = productMap.get(item.productId.toString());
      if (!product || product.stock < item.qty) {
        // Rollback del saldo debitado
        await this.walletModel.findOneAndUpdate(
          { userId },
          { $inc: { balanceCents: order.totalCents } },
        );
        throw new BadRequestException(
          `Stock insuficiente para producto ${item.productId}`,
        );
      }
    }

    // Descontar stock en una sola operación de escritura bulk (fix N+1 writes)
    await this.productModel.bulkWrite(
      order.items.map((item) => ({
        updateOne: {
          filter: { _id: item.productId, stock: { $gte: item.qty } },
          update: { $inc: { stock: -item.qty } },
        },
      })),
    );

    order.status = 'paid';
    await order.save();

    await this.txModel.create({
      userId,
      amountCents: -order.totalCents,
      type: 'payment',
      orderId,
    });

    return order;
  }

  async findOneForUser(userId: string, orderId: string) {
    const order = await this.orderModel.findById(orderId);
    // Fix IDOR: un usuario solo puede ver sus propias órdenes
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Orden no encontrada');
    }
    return order;
  }
}
