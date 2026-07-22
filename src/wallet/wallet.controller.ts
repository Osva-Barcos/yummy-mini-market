import { Body, Controller, Get, Post } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { TopupDto } from './dto/topup.dto';
import { UserId } from '../common/decorators/user-id.decorator';

@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  get(@UserId() userId: string) {
    return this.wallet.getOrCreate(userId);
  }

  @Post('topup')
  topup(@UserId() userId: string, @Body() body: TopupDto) {
    return this.wallet.topup(userId, body.amountCents);
  }
}
