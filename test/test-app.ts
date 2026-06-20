import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ProductsModule } from '../src/products/products.module';
import { OrdersModule } from '../src/orders/orders.module';
import { WalletModule } from '../src/wallet/wallet.module';
import { Product } from '../src/products/schemas/product.schema';
import { configureApp } from '../src/app-setup';

export interface TestContext {
  app: INestApplication;
  productModel: Model<any>;
  stop: () => Promise<void>;
}

/**
 * Levanta la app contra un MongoDB en memoria, usando la MISMA configuración
 * global que el arranque real (configureApp). No incluye el módulo de
 * conciliación para mantener los tests deterministas.
 */
export async function createTestApp(): Promise<TestContext> {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  const moduleRef = await Test.createTestingModule({
    imports: [
      MongooseModule.forRoot(uri),
      ProductsModule,
      OrdersModule,
      WalletModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const productModel = moduleRef.get<Model<any>>(getModelToken(Product.name));

  const stop = async () => {
    await app.close();
    await mongod.stop();
  };

  return { app, productModel, stop };
}
