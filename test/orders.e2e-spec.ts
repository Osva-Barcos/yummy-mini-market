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

  // ── Tests propios ────────────────────────────────────────────────────────

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

  // TODO (candidato): el saldo de la wallet y el stock deben ser seguros ante
  // operaciones concurrentes (ver "Comportamiento esperado" en el README).
  // Se valora que escribas un test que reproduzca el problema de concurrencia.
  it.todo('los pagos concurrentes no permiten gastar más que el saldo');
});
