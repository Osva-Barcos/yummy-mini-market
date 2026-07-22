import { Type } from 'class-transformer';
import {
  IsArray,
  IsMongoId,
  IsInt,
  Min,
  ValidateNested,
  ArrayMinSize,
  IsOptional,
  IsString,
} from 'class-validator';

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

  // Hallazgo de revisión: POST /orders no tenía dedupe — un retry de red o un
  // doble-click crea una segunda orden 'pending' idéntica, que si se paga dos
  // veces cobra dos veces la misma intención de compra. Clave opcional
  // generada por el cliente para que un retry devuelva la orden ya creada.
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
