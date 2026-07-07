import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Configuración global compartida entre el arranque real (main.ts) y los tests.
 * Centraliza aquí pipes, filtros, interceptores, etc.
 */
// Bug 3: esta función estaba vacía. Sin useGlobalPipes, los decoradores de
// class-validator en los DTOs existían pero nunca se ejecutaban (ej: qty: -3 pasaba sin error).
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }), // activa el pipe que usa dos librerías
  );
}
/*El ValidationPipe de NestJS internamente llama a class-transformer para convertir, y luego a class-validator para validar.
Sin este useGlobalPipes, las dos librerías instaladas no harían nada — están instaladas pero nadie las llama.*/