import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Wallet, WalletDocument } from './schemas/wallet.schema';
import {
  WalletTransaction,
  WalletTransactionDocument,
} from './schemas/wallet-transaction.schema';

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(Wallet.name)
    private readonly walletModel: Model<WalletDocument>,
    @InjectModel(WalletTransaction.name)
    private readonly txModel: Model<WalletTransactionDocument>,
  ) {}

  async getOrCreate(userId: string) {
    let wallet = await this.walletModel.findOne({ userId });
    if (!wallet) {
      wallet = await this.walletModel.create({ userId, balanceCents: 0 });
    }
    return wallet;
  }

  async topup(userId: string, amountCents: number) {
    const wallet = await this.getOrCreate(userId);
    wallet.balanceCents += amountCents;
    await wallet.save();
    await this.txModel.create({ userId, amountCents, type: 'topup' });
    return wallet;
  }
}
 //problema de atomicidadad