import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { WalletModule } from './wallet/wallet.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';

@Module({
  imports: [
    // Bug 2: la URI estaba hardcodeada a 'localhost', lo que rompía la conexión
    // dentro de Docker (ahí 'localhost' es el propio contenedor, no el servicio 'mongo').
    // Fix: leer MONGO_URI de env, con fallback a localhost para correr sin Docker.
    MongooseModule.forRoot(process.env.MONGO_URI ?? 'mongodb://localhost:27017/market'),
    ScheduleModule.forRoot(),
    ProductsModule,
    OrdersModule,
    WalletModule,
    ReconciliationModule,
  ],
})
export class AppModule {}
