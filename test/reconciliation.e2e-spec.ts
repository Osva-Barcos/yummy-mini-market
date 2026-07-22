import { createTestApp, TestContext } from './test-app';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service';

// ReconciliationModule está excluido de createTestApp() a propósito (ver
// TESTS.md) para que los tests no dependan de un scheduler activo. Estos
// tests instancian el service directamente con los modelos ya conectados
// al Mongo en memoria y llaman a reconcilePendingOrders() a mano — nunca se
// activa el @Cron, solo se ejecuta el método una vez de forma determinista.
describe('ReconciliationService.reconcilePendingOrders (batching + idempotencia)', () => {
  let ctx: TestContext;
  let service: ReconciliationService;

  beforeAll(async () => {
    ctx = await createTestApp();
    service = new ReconciliationService(ctx.orderModel, ctx.txModel);
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('crea exactamente una tx de reconciliación por orden pending, sin tocar las paid', async () => {
    const pendingA = await ctx.orderModel.create({
      userId: 'user-recon-a',
      items: [],
      totalCents: 100,
      status: 'pending',
    });
    const pendingB = await ctx.orderModel.create({
      userId: 'user-recon-b',
      items: [],
      totalCents: 200,
      status: 'pending',
    });
    const paid = await ctx.orderModel.create({
      userId: 'user-recon-c',
      items: [],
      totalCents: 300,
      status: 'paid',
    });

    await service.reconcilePendingOrders();

    const txForA = await ctx.txModel.find({
      orderId: pendingA._id.toString(),
      type: 'reconciliation',
    });
    const txForB = await ctx.txModel.find({
      orderId: pendingB._id.toString(),
      type: 'reconciliation',
    });
    const txForPaid = await ctx.txModel.find({
      orderId: paid._id.toString(),
      type: 'reconciliation',
    });

    expect(txForA).toHaveLength(1);
    expect(txForB).toHaveLength(1);
    expect(txForPaid).toHaveLength(0);
  });

  it('no duplica registros al correr varias veces sobre las mismas órdenes pending (idempotencia, Bug 13)', async () => {
    const pending = await ctx.orderModel.create({
      userId: 'user-recon-idempotent',
      items: [],
      totalCents: 150,
      status: 'pending',
    });

    await service.reconcilePendingOrders();
    await service.reconcilePendingOrders();
    await service.reconcilePendingOrders();

    const txs = await ctx.txModel.find({
      orderId: pending._id.toString(),
      type: 'reconciliation',
    });
    expect(txs).toHaveLength(1);
  });

  it('en una corrida con órdenes ya flaggeadas y nuevas, solo crea tx para las nuevas', async () => {
    const already = await ctx.orderModel.create({
      userId: 'user-recon-mixed-old',
      items: [],
      totalCents: 400,
      status: 'pending',
    });
    await service.reconcilePendingOrders(); // flaggea `already`

    const nuevo = await ctx.orderModel.create({
      userId: 'user-recon-mixed-new',
      items: [],
      totalCents: 500,
      status: 'pending',
    });

    await service.reconcilePendingOrders();

    const txOld = await ctx.txModel.find({
      orderId: already._id.toString(),
      type: 'reconciliation',
    });
    const txNew = await ctx.txModel.find({
      orderId: nuevo._id.toString(),
      type: 'reconciliation',
    });

    expect(txOld).toHaveLength(1); // sigue en 1, no se duplicó
    expect(txNew).toHaveLength(1); // se creó en esta corrida
  });
});
