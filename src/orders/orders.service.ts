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
    // Hallazgo de revisión: un retry de red o doble-click en POST /orders creaba
    // una segunda orden 'pending' idéntica. Si el cliente manda idempotencyKey,
    // devolver la orden ya creada en vez de duplicarla.
    if (dto.idempotencyKey) {
      const existing = await this.orderModel.findOne({
        userId,
        idempotencyKey: dto.idempotencyKey,
      });
      if (existing) {
        return existing;
      }
    }

    // Bug 14 (N+1): antes se hacía un findById por cada item dentro de un for.
    // Fix: una sola query con $in trae todos los productos del pedido de una vez.
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

    try {
      return await this.orderModel.create({
        userId,
        items,
        totalCents: total,
        status: 'pending',
        idempotencyKey: dto.idempotencyKey,
      });
    } catch (err: any) {
      // El índice único {userId, idempotencyKey} es la barrera atómica real
      // contra dos creates concurrentes con la misma key (el findOne de arriba
      // es solo un atajo para el caso serial, no evita la carrera).
      if (err?.code === 11000 && dto.idempotencyKey) {
        const existing = await this.orderModel.findOne({
          userId,
          idempotencyKey: dto.idempotencyKey,
        });
        if (existing) {
          return existing;
        }
      }
      throw err;
    }
  }

  // Bug 8: este método tenía un try/catch que atrapaba cualquier error y devolvía
  // { status: 'ok' } hardcodeado, ocultando fallos de infraestructura y de negocio.
  // Fix: se eliminó el try/catch. Las excepciones no atrapadas las convierte NestJS
  // automáticamente en la respuesta HTTP correcta (NotFoundException → 404, etc).
  async pay(userId: string, orderId: string) {
    const order = await this.orderModel.findById(orderId);

    // Bug 7 (IDOR): antes no se verificaba que la orden fuera del usuario que paga.
    // Usuario B podía pagar (y que se le descuente el saldo a B) una orden de A.
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Orden no encontrada');
    }

    if (order.status === 'paid') {
      return order;
    }

    // Bug 9 (saldo insuficiente no daba error) + Bug 10 (race condition / double-spend):
    // antes se hacía "if (wallet.balanceCents >= total)" leyendo en memoria, lo que
    // dejaba una ventana entre leer y guardar donde dos pagos concurrentes podían
    // gastar más saldo del disponible. Fix: findOneAndUpdate con $gte como guard
    // en el filtro y $inc en el update → chequeo y descuento en una sola operación
    // atómica de Mongo, segura ante pagos concurrentes.
    const wallet = await this.walletModel.findOneAndUpdate(
      { userId, balanceCents: { $gte: order.totalCents } },
      { $inc: { balanceCents: -order.totalCents } },
      { new: true },
    );

    if (!wallet) {
      throw new BadRequestException('Saldo insuficiente');
    }

    // Bug 11 (oversell) + hallazgo de revisión (resultado de bulkWrite no verificado):
    // el filtro { stock: { $gte: qty } } es la barrera atómica real anti-oversell,
    // pero un pre-check en JS + bulkWrite sin comprobar su resultado deja una ventana:
    // dos pagos concurrentes sobre el mismo producto pueden pasar ambos el pre-check
    // (leen el mismo stock antes de que el primero escriba), y si el segundo update
    // no matchea, el pago se marca "paid" y se descuenta la wallet igual, sin que el
    // stock se haya descontado. Fix: decrementar cada ítem con su propio
    // findOneAndUpdate atómico (en paralelo, no secuencial → no reintroduce el N+1
    // del Bug 14) y verificar el resultado de cada uno. Si alguno falla, se revierte
    // el stock de los ítems que sí se descontaron y el saldo ya debitado.
    const stockUpdates = await Promise.all(
      order.items.map((item) =>
        this.productModel.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: item.qty } },
          { $inc: { stock: -item.qty } },
        ),
      ),
    );

    const failedIndex = stockUpdates.findIndex((updated) => !updated);

    if (failedIndex !== -1) {
      const succeededItems = order.items.filter((_, i) => stockUpdates[i]);
      if (succeededItems.length > 0) {
        await this.productModel.bulkWrite(
          succeededItems.map((item) => ({
            updateOne: {
              filter: { _id: item.productId },
              update: { $inc: { stock: item.qty } },
            },
          })),
        );
      }
      // Rollback del saldo debitado
      await this.walletModel.findOneAndUpdate(
        { userId },
        { $inc: { balanceCents: order.totalCents } },
      );
      throw new BadRequestException(
        `Stock insuficiente para producto ${order.items[failedIndex].productId}`,
      );
    }

    // Bug 16 (race condition en order.status): dos requests concurrentes pueden leer
    // status:'pending' antes de que la primera guarde 'paid' (read-then-check no
    // atómico). El findOneAndUpdate de la wallet ya frena el double-spend real
    // (la segunda request no tiene saldo), pero la solución completa sería hacer
    // este cambio de estado también atómico: findOneAndUpdate({_id, status:'pending'},
    // {$set:{status:'paid'}}), o usar Mongo Sessions con withTransaction().
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
    // Bug 6 (IDOR): antes se buscaba la orden solo por orderId, sin verificar
    // dueño — cualquier usuario podía ver la orden completa de otro con solo
    // conocer su ID. Fix: comparar order.userId === userId; se devuelve 404
    // (no 403) para no revelar que la orden existe.
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Orden no encontrada');
    }
    return order;
  }
}
