import { Type } from 'class-transformer';
import { IsArray, IsMongoId, IsInt, Min, ValidateNested, ArrayMinSize } from 'class-validator';

// Bug 4: esta clase no tenía decoradores. qty aceptaba 0 o negativos y productId
// aceptaba cualquier string. Fix: decoradores de class-validator en cada campo.
export class CreateOrderItemDto {
  @IsMongoId()
  productId: string;

  @IsInt()
  @Min(1)
  qty: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  // @ValidateNested + @Type: hace que class-transformer arme instancias reales de
  // CreateOrderItemDto por cada elemento, para que sus propios decoradores se validen
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
