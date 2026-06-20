export class CreateOrderItemDto {
  productId: string;
  qty: number;
}

export class CreateOrderDto {
  items: CreateOrderItemDto[];
}
