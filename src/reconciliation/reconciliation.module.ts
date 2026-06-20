import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [OrdersModule, WalletModule],
  providers: [ReconciliationService],
})
export class ReconciliationModule {}
