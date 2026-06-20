import request from 'supertest';
import { createTestApp, TestContext } from './test-app';

describe('Products', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('GET /products devuelve el catálogo sembrado', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);
    expect(res.body[0]).toHaveProperty('priceCents');
  });
});
