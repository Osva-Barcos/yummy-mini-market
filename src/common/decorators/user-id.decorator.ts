import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

// Hallazgo de revisión: @Headers('x-user-id') no validaba que el header viniera
// presente. Sin él, userId era undefined y llegaba tal cual a comparaciones de
// ownership (order.userId !== userId) y a filtros de Mongo, produciendo 404
// confusos o, en wallet, colisiones entre distintos callers sin autenticar sobre
// el mismo documento (Wallet.userId es unique). Fix: decorador que exige el
// header y falla rápido con 401 si falta o está vacío.
export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const userId = request.headers['x-user-id'];

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new UnauthorizedException('Falta el header x-user-id');
    }

    return userId;
  },
);
