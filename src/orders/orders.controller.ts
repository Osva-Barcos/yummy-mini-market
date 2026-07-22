import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UserId } from '../common/decorators/user-id.decorator';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@UserId() userId: string, @Body() dto: CreateOrderDto) {
    return this.orders.create(userId, dto);
  }

  @Post(':id/pay')
  pay(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orders.pay(userId, id);
  }

  @Get(':id')
  findOne(
    @UserId() userId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.orders.findOneForUser(userId, id);
  }
}
