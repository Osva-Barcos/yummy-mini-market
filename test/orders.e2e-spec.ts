import request from 'supertest';
import { createTestApp, TestContext } from './test-app';

describe('Orders', () => {
  let ctx: TestContext;
  let server: any;

  beforeAll(async () => {
    ctx = await createTestApp();
    server = ctx.app.getHttpServer();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  // Inserta un producto a medida para escenarios concretos.
  async function seedProduct(priceCents: number, stock: number) {
    const p = await ctx.productModel.create({
      name: `test-${priceCents}-${stock}`,
      priceCents,
      stock,
    });
    return p._id.toString();
  }

  it('flujo feliz: recargar saldo, crear orden y pagarla', async () => {
    const user = 'user-happy';
    const productId = await seedProduct(850, 10);

    await request(server)
      .post('/wallet/topup')
      .set('x-user-id', user)
      .send({ amountCents: 5000 })
      .expect(201);

    const created = await request(server)
      .post('/orders')
      .set('x-user-id', user)
      .send({ items: [{ productId, qty: 1 }] })
      .expect(201);

    const orderId = created.body._id;

    const paid = await request(server)
      .post(`/orders/${orderId}/pay`)
      .set('x-user-id', user)
      .expect(201);

    expect(paid.body.status).toBe('paid');
  });

  it('rechaza cantidades negativas (no debe permitir total negativo)', async () => {
    const user = 'user-neg';
    const productId = await seedProduct(850, 10);

    await request(server)
      .post('/orders')
      .set('x-user-id', user)
      .send({ items: [{ productId, qty: -3 }] })
      .expect(400);
  });

  it('un usuario NO puede ver la orden de otro usuario (IDOR)', async () => {
    const owner = 'user-owner';
    const attacker = 'user-attacker';
    const productId = await seedProduct(850, 10);

    const created = await request(server)
      .post('/orders')
      .set('x-user-id', owner)
      .send({ items: [{ productId, qty: 1 }] })
      .expect(201);

    const orderId = created.body._id;

    await request(server)
      .get(`/orders/${orderId}`)
      .set('x-user-id', attacker)
      .expect(404);
  });

  it('no permite vender más stock del disponible (oversell)', async () => {
    const user = 'user-oversell';
    const productId = await seedProduct(100, 1); // solo 1 en stock

    await request(server)
      .post('/wallet/topup')
      .set('x-user-id', user)
      .send({ amountCents: 100000 })
      .expect(201);

    const created = await request(server)
      .post('/orders')
      .set('x-user-id', user)
      .send({ items: [{ productId, qty: 5 }] }) // pide 5
      .expect(201);

    await request(server)
      .post(`/orders/${created.body._id}/pay`)
      .set('x-user-id', user);

    const product = await ctx.productModel.findById(productId);
    expect(product.stock).toBeGreaterThanOrEqual(0);
  });

  it('un usuario NO puede pagar la orden de otro usuario (IDOR pay)', async () => {
    const owner = 'user-owner-pay';
    const attacker = 'user-attacker-pay';
    const productId = await seedProduct(850, 10);

    const created = await request(server)
      .post('/orders')
      .set('x-user-id', owner)
      .send({ items: [{ productId, qty: 1 }] })
      .expect(201);

    await request(server)
      .post(`/orders/${created.body._id}/pay`)
      .set('x-user-id', attacker)
      .expect(404);
  });

  // ── Tests propios ────────────────────────────────────────────────────────

  it('GET /wallet sin el header x-user-id devuelve 401 en vez de crear una wallet para "undefined"', async () => {
    await request(server).get('/wallet').expect(401);
  });

  it('POST /wallet/topup sin el header x-user-id devuelve 401', async () => {
    await request(server)
      .post('/wallet/topup')
      .send({ amountCents: 100 })
      .expect(401);
  });

  it('topup rechaza monto negativo o cero', async () => {
    const user = 'user-neg-topup';

    await request(server)
      .post('/wallet/topup')
      .set('x-user-id', user)
      .send({ amountCents: -500 })
      .expect(400);

    await request(server)
      .post('/wallet/topup')
      .set('x-user-id', user)
      .send({ amountCents: 0 })
      .expect(400);
  });

  it('pay con saldo insuficiente devuelve error (no silencio)', async () => {
    const user = 'user-broke';
    const productId = await seedProduct(1000, 5);

    // El usuario NO recarga saldo → balance = 0
    const created = await request(server)
      .post('/orders')
      .set('x-user-id', user)
      .send({ items: [{ productId, qty: 1 }] })
      .expect(201);

    // El pago debe fallar con un error visible, no con status:'ok' silencioso
    await request(server)
      .post(`/orders/${created.body._id}/pay`)
      .set('x-user-id', user)
      .expect(400);
  });

  it('los pagos concurrentes no permiten gastar más que el saldo', async () => {
    const user = 'user-concurrent';
    const productId = await seedProduct(1000, 10); // precio 1000, stock 10

    // Saldo justo para pagar exactamente una orden
    await request(server)
      .post('/wallet/topup')
      .set('x-user-id', user)
      .send({ amountCents: 1000 })
      .expect(201);

    const created = await request(server)
      .post('/orders')
      .set('x-user-id', user)
      .send({ items: [{ productId, qty: 1 }] })
      .expect(201);

    const orderId = created.body._id;

    // Dos pagos simultáneos sobre la misma orden
    const [res1, res2] = await Promise.all([
      request(server).post(`/orders/${orderId}/pay`).set('x-user-id', user),
      request(server).post(`/orders/${orderId}/pay`).set('x-user-id', user),
    ]);

    // Al menos uno debe haber tenido éxito; el otro puede ser 201 (idempotente) o 400
    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(201);

    // Invariante financiero: el saldo no puede quedar negativo
    const wallet = await ctx.walletModel.findOne({ userId: user });
    expect(wallet.balanceCents).toBeGreaterThanOrEqual(0);

    // Invariante de inventario: el stock no puede quedar negativo
    const product = await ctx.productModel.findById(productId);
    expect(product.stock).toBeGreaterThanOrEqual(0);
  });

  // ── Hallazgos de revisión (backend-standards-reviewer) ──────────────────

  it('pagos concurrentes de DOS órdenes distintas que compiten por el mismo stock no dejan wallet debitada sin stock descontado', async () => {
    const userA = 'user-race-a';
    const userB = 'user-race-b';
    const productId = await seedProduct(500, 1); // solo alcanza para un pago

    await request(server)
      .post('/wallet/topup')
      .set('x-user-id', userA)
      .send({ amountCents: 5000 })
      .expect(201);
    await request(server)
      .post('/wallet/topup')
      .set('x-user-id', userB)
      .send({ amountCents: 5000 })
      .expect(201);

    const orderA = await request(server)
      .post('/orders')
      .set('x-user-id', userA)
      .send({ items: [{ productId, qty: 1 }] })
      .expect(201);
    const orderB = await request(server)
      .post('/orders')
      .set('x-user-id', userB)
      .send({ items: [{ productId, qty: 1 }] })
      .expect(201);

    const [resA, resB] = await Promise.all([
      request(server)
        .post(`/orders/${orderA.body._id}/pay`)
        .set('x-user-id', userA),
      request(server)
        .post(`/orders/${orderB.body._id}/pay`)
        .set('x-user-id', userB),
    ]);

    // Exactamente uno debe ganar el stock disponible; el otro debe fallar.
    expect([resA.status, resB.status].sort()).toEqual([201, 400]);

    const product = await ctx.productModel.findById(productId);
    expect(product.stock).toBe(0);

    const winnerIsA = resA.status === 201;
    const winnerUser = winnerIsA ? userA : userB;
    const loserUser = winnerIsA ? userB : userA;
    const loserOrderId = winnerIsA ? orderB.body._id : orderA.body._id;

    // El ganador pagó: se le debitó el saldo una sola vez.
    const winnerWallet = await ctx.walletModel.findOne({ userId: winnerUser });
    expect(winnerWallet.balanceCents).toBe(4500);

    // El que perdió la carrera por stock: su saldo debe quedar EXACTAMENTE
    // como estaba (rollback completo), no debitado a mitad de camino.
    const loserWallet = await ctx.walletModel.findOne({ userId: loserUser });
    expect(loserWallet.balanceCents).toBe(5000);

    // Y su orden debe seguir 'pending', nunca marcarse 'paid' sin stock real.
    const loserOrder = await ctx.orderModel.findById(loserOrderId);
    expect(loserOrder.status).toBe('pending');
  });

  it('GET /orders/:id sin el header x-user-id devuelve 401 en vez de tratar userId como undefined', async () => {
    await request(server).get('/orders/000000000000000000000000').expect(401);
  });

  it('POST /orders/:id/pay con un id que no es un ObjectId válido devuelve 400, no 500', async () => {
    const user = 'user-bad-id';
    await request(server)
      .post('/orders/no-soy-un-objectid/pay')
      .set('x-user-id', user)
      .expect(400);
  });

  it('GET /orders/:id con un id que no es un ObjectId válido devuelve 400, no 500', async () => {
    const user = 'user-bad-id-get';
    await request(server)
      .get('/orders/no-soy-un-objectid')
      .set('x-user-id', user)
      .expect(400);
  });

  it('POST /orders con idempotencyKey repetida no duplica la orden', async () => {
    const user = 'user-idempotent';
    const productId = await seedProduct(700, 10);
    const idempotencyKey = 'checkout-abc-123';

    const first = await request(server)
      .post('/orders')
      .set('x-user-id', user)
      .send({ items: [{ productId, qty: 1 }], idempotencyKey })
      .expect(201);

    const retry = await request(server)
      .post('/orders')
      .set('x-user-id', user)
      .send({ items: [{ productId, qty: 1 }], idempotencyKey })
      .expect(201);

    expect(retry.body._id).toBe(first.body._id);

    const count = await ctx.orderModel.countDocuments({ userId: user });
    expect(count).toBe(1);
  });

  it('POST /orders concurrentes con la misma idempotencyKey crean una sola orden', async () => {
    const user = 'user-idempotent-race';
    const productId = await seedProduct(700, 10);
    const idempotencyKey = 'checkout-race-1';

    const [res1, res2] = await Promise.all([
      request(server)
        .post('/orders')
        .set('x-user-id', user)
        .send({ items: [{ productId, qty: 1 }], idempotencyKey }),
      request(server)
        .post('/orders')
        .set('x-user-id', user)
        .send({ items: [{ productId, qty: 1 }], idempotencyKey }),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body._id).toBe(res2.body._id);

    const count = await ctx.orderModel.countDocuments({ userId: user });
    expect(count).toBe(1);
  });
});
