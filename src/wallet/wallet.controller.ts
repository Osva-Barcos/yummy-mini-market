import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { TopupDto } from './dto/topup.dto';

@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  get(@Headers('x-user-id') userId: string) {
    return this.wallet.getOrCreate(userId);
  }

  @Post('topup')
  topup(
    @Headers('x-user-id') userId: string,
    @Body() body: TopupDto,
  ) {
    return this.wallet.topup(userId, body.amountCents);
  }
}
