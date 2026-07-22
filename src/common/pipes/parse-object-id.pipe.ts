import { BadRequestException, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';

// Hallazgo de revisión: @Param('id') sin validar como ObjectId dejaba que un id
// malformado (ej. "abc") llegara directo a orderModel.findById(id), que lanza un
// CastError de Mongoose no manejado por el filtro de excepciones de Nest → 500
// genérico en vez de un 400 limpio. Fix: pipe que rechaza ids inválidos antes de
// que lleguen al service.
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Id inválido: ${value}`);
    }
    return value;
  }
}
