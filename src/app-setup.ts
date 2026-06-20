import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Configuración global compartida entre el arranque real (main.ts) y los tests.
 * Centraliza aquí pipes, filtros, interceptores, etc.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
}
