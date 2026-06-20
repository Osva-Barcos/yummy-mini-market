# BUGS encontrados

> Una entrada por cada bug. Niveles: **1 = bloqueante**, **2 = core**, **3 = bonus/performance**.

---

## Bug 1 — Dockerfile: build falla por falta de devDependencies

- **Nivel:** 1
- **Archivo(s):** `Dockerfile`
- **Síntoma:** `docker compose up --build` termina con error `nest: not found`. La imagen nunca se construye y la app no levanta.
- **Causa raíz:** `npm ci --omit=dev` instala solo dependencias de producción antes de copiar el código fuente. El comando `npm run build` ejecuta `nest build`, que necesita `@nestjs/cli` (que está en `devDependencies`) → el binario `nest` no existe en el contenedor.
- **Fix:** Multi-stage build: **Stage 1 (builder)** instala todas las deps (`npm ci`) y compila (`npm run build`). **Stage 2 (runtime)** parte de una imagen limpia, instala solo prod deps y copia únicamente `dist/` del stage anterior. La imagen final no tiene devDeps ni código fuente.
- **Prevención:** Agregar un paso de CI que corra `docker build` en cada PR. Un lint de Dockerfile (`hadolint`) también detecta este patrón.

---

## Bug 2 — MongoDB URI hardcodeada ignora Docker

- **Nivel:** 1
- **Archivo(s):** `src/app.module.ts`
- **Síntoma:** Con Docker la app arranca pero no puede conectarse a MongoDB; logs muestran `ECONNREFUSED 127.0.0.1:27017`. El `docker-compose.yml` pasa `MONGO_URI=mongodb://mongo:27017/market` (apuntando al servicio `mongo`), pero la app lo ignora.
- **Causa raíz:** `MongooseModule.forRoot('mongodb://localhost:27017/market')` tiene la URI hardcodeada. Dentro del contenedor, `localhost` es el propio contenedor, no el servicio `mongo` definido en `docker-compose`.
- **Fix:** `MongooseModule.forRoot(process.env.MONGO_URI ?? 'mongodb://localhost:27017/market')`. El fallback mantiene compatibilidad con el modo local (Opción B del README).
- **Prevención:** Nunca hardcodear URIs de infraestructura; usar siempre variables de entorno. Un test de arranque que verifique la conectividad con Mongo lo hubiera detectado.

---

## Bug 3 — ValidationPipe no configurado: DTOs no se validan

- **Nivel:** 2
- **Archivo(s):** `src/app-setup.ts`
- **Síntoma:** Enviar `qty: -3` en `POST /orders` crea una orden con `totalCents` negativo en lugar de devolver 400. Los decoradores de `class-validator` en los DTOs son ignorados.
- **Causa raíz:** `configureApp()` estaba vacía. Sin `app.useGlobalPipes(new ValidationPipe(...))`, NestJS no procesa los metadatos de validación en ningún endpoint, aunque los decoradores existan en el DTO.
- **Fix:** Registrar `ValidationPipe` con `{ whitelist: true, forbidNonWhitelisted: true }` en `configureApp`. La misma función se usa en `main.ts` y en `createTestApp`, garantizando que prod y tests tengan la misma configuración.
- **Prevención:** Incluir un test e2e de validación para cada DTO nuevo. `whitelist: true` también previene que propiedades inesperadas lleguen a los servicios.

---

## Bug 4 — CreateOrderDto sin decoradores: qty negativo o cero pasa sin error

- **Nivel:** 2
- **Archivo(s):** `src/orders/dto/create-order.dto.ts`
- **Síntoma:** Incluso con el ValidationPipe activo, `qty: 0` o `qty: -5` no generaban error porque el DTO no tenía ninguna anotación de validación.
- **Causa raíz:** `CreateOrderItemDto` era una clase plana sin decoradores. `qty: number` acepta cualquier número, incluidos negativos; `productId: string` aceptaba cualquier cadena, no necesariamente un ObjectId válido.
- **Fix:** Agregar `@IsInt() @Min(1)` sobre `qty`, `@IsMongoId()` sobre `productId`, y `@IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateOrderItemDto)` sobre `items`. Esto garantiza la regla de negocio "qty > 0" a nivel de entrada.
- **Prevención:** En NestJS, los DTOs siempre deben tener decoradores de `class-validator`. Añadir un test que pruebe el límite de `qty = 0` y `qty = -1` como parte del suite de validación.

---

## Bug 5 — Topup acepta montos negativos o cero

- **Nivel:** 2
- **Archivo(s):** `src/wallet/wallet.controller.ts`
- **Síntoma:** `POST /wallet/topup` con `{ "amountCents": -1000 }` reduce el saldo del usuario en lugar de rechazar la petición. `amountCents: 0` no hace nada pero tampoco falla.
- **Causa raíz:** El body del endpoint estaba tipado como `{ amountCents: number }` (tipo inline), no como una clase con decoradores. El ValidationPipe solo valida clases con metadatos de `reflect-metadata`; los tipos inline los ignora.
- **Fix:** Crear `src/wallet/dto/topup.dto.ts` con `@IsInt() @Min(1) amountCents: number` y usarlo en el controller. Esto garantiza que solo se acepten recargas con montos enteros positivos.
- **Prevención:** Nunca usar tipos inline en `@Body()` cuando se necesita validación. Linting rule: preferir DTOs tipados con `class-validator` en todos los endpoints que reciben body.

---

## Bug 6 — IDOR en GET /orders/:id: un usuario ve órdenes ajenas

- **Nivel:** 2
- **Archivo(s):** `src/orders/orders.service.ts` → `findOneForUser()`
- **Síntoma:** Un usuario autenticado como `user-A` puede hacer `GET /orders/<id-de-orden-de-user-B>` y recibir la orden completa de otro usuario. El test e2e de IDOR lo reproduce y esperaba 404.
- **Causa raíz:** `findOneForUser()` buscaba la orden solo por `orderId` sin verificar que `order.userId === userId`. Cualquier ID válido de orden devolvía el documento completo, independientemente de a quién perteneciera.
- **Fix:** Agregar la verificación `if (!order || order.userId !== userId) throw new NotFoundException(...)`. Se devuelve 404 (y no 403) intencionalmente para no revelar la existencia de la orden a un atacante.
- **Prevención:** Toda query que devuelva recursos del usuario debe incluir el `userId` como filtro o verificar autoría en el resultado. Test e2e de IDOR como el existente, ejecutado en cada PR.

---

## Bug 7 — IDOR en POST /orders/:id/pay: usuario paga orden ajena

- **Nivel:** 2
- **Archivo(s):** `src/orders/orders.service.ts` → `pay()`
- **Síntoma:** Usuario B puede llamar `POST /orders/<id-de-orden-de-A>/pay`, lo que deduce el saldo de B para pagar una orden que pertenece a A. Si A y B tienen wallets, el saldo de B se reduce sin que B haya creado esa orden.
- **Causa raíz:** `pay()` verificaba `order.status === 'paid'` pero nunca `order.userId === userId`. La comprobación de pertenencia estaba ausente.
- **Fix:** Al inicio de `pay()`, verificar `if (!order || order.userId !== userId) throw new NotFoundException(...)`, antes de cualquier operación financiera.
- **Prevención:** Cada operación sobre un recurso del usuario (leer, pagar, cancelar) debe verificar autoría. Agregar test e2e: usuario B intenta pagar orden de usuario A → 404.

---

## Bug 8 — catch silencia errores y devuelve éxito falso

- **Nivel:** 2
- **Archivo(s):** `src/orders/orders.service.ts` → `pay()`
- **Síntoma:** Si la BD falla o cualquier operación lanza una excepción durante el pago, el cliente recibe `{ "status": "ok" }` con HTTP 200. El pago puede haber fallado a mitad (wallet debitada, stock no descontado) y el cliente no lo sabe.
- **Causa raíz:** El bloque `try/catch` de `pay()` atrapaba cualquier error y devolvía un objeto hardcodeado `{ status: 'ok' }`, enmascarando tanto errores de infraestructura como errores de lógica de negocio.
- **Fix:** Eliminar el `try/catch`. NestJS maneja las excepciones no capturadas y las convierte en respuestas HTTP adecuadas (`NotFoundException` → 404, `BadRequestException` → 400, errores no controlados → 500). Los errores ahora son visibles en logs y en la respuesta al cliente.
- **Prevención:** Nunca silenciar excepciones con `catch(e) { return algo }` en servicios críticos. Usar filtros de excepción de NestJS para logging centralizado. Agregar tests que verifiquen que un fallo devuelve el status HTTP correcto.

---

## Bug 9 — Saldo insuficiente no devuelve error

- **Nivel:** 2
- **Archivo(s):** `src/orders/orders.service.ts` → `pay()`
- **Síntoma:** Si el usuario no tiene saldo suficiente (o no tiene wallet), `POST /orders/:id/pay` devuelve la orden con `status: 'pending'` y HTTP 201, como si el pago hubiera quedado encolado. El cliente no puede distinguirlo de un pago exitoso.
- **Causa raíz:** `if (wallet && wallet.balanceCents >= order.totalCents)` simplemente salteaba el bloque de pago sin lanzar ningún error. La ausencia de wallet también pasaba silenciosamente.
- **Fix:** Reemplazar el `if` condicional por una operación atómica `findOneAndUpdate` con `$gte` como guard. Si la operación no encuentra un documento (saldo insuficiente o wallet inexistente), lanza `BadRequestException('Saldo insuficiente')` con HTTP 400.
- **Prevención:** Un pago que no se ejecuta nunca debe devolver éxito. Test propio agregado: `pay con saldo insuficiente devuelve error`.

---

## Bug 10 — Race condition en wallet: double-spend ante pagos concurrentes

- **Nivel:** 2
- **Archivo(s):** `src/orders/orders.service.ts` → `pay()` · `src/wallet/wallet.service.ts` → `topup()`
- **Síntoma:** Dos peticiones `POST /orders/:id/pay` concurrentes del mismo usuario pueden gastar más saldo del disponible. Ejemplo: saldo = 1000, dos pagos de 800 simultáneos → ambos leen 1000, ambos pasan el guard, ambos guardan 200 → se gastaron 1600 teniendo 1000.
- **Causa raíz:** El patrón read → modify → write no es atómico. Entre el `findOne` y el `wallet.save()` puede entrar otra request que lea el mismo valor sin modificar.
- **Fix:** Reemplazar el patrón read-modify-write por `findOneAndUpdate` con `$inc` y un filtro `{ balanceCents: { $gte: totalCents } }`. MongoDB garantiza que el check y el decrement ocurren en una sola operación atómica a nivel de documento.
- **Prevención:** En operaciones financieras, nunca usar el patrón read-modify-write. Usar siempre operadores atómicos de MongoDB (`$inc`, `$set` con condición). Para consistencia multi-documento (wallet + stock + orden), lo ideal es MongoDB Sessions con `withTransaction()` sobre un Replica Set.

---

## Bug 11 — Oversell: stock puede quedar negativo

- **Nivel:** 2
- **Archivo(s):** `src/orders/orders.service.ts` → `pay()`
- **Síntoma:** Si se crea una orden con `qty: 5` y el stock es 1, al pagar, el stock queda en `-4`. El inventario muestra valores negativos, lo que rompe cualquier reporte o lógica posterior que asuma `stock >= 0`.
- **Causa raíz:** `product.stock -= item.qty` se ejecutaba sin verificar si `product.stock >= item.qty`. No había ningún guard contra stock insuficiente en el flujo de pago.
- **Fix:** Antes del descuento, verificar `product.stock < item.qty` y lanzar `BadRequestException`. Si el guard falla, se hace rollback del saldo ya debitado. El descuento de stock usa `bulkWrite` con `{ stock: { $gte: item.qty } }` como filtro atómico para mayor seguridad.
- **Prevención:** El stock es un invariante crítico. Combinar validación en código con el filtro `$gte` en la query de MongoDB para que ni siquiera un bug de código pueda producir stock negativo a nivel de base de datos.

---

## Bug 12 — Reconciliación con setInterval de 1 segundo satura la base de datos

- **Nivel:** 2
- **Archivo(s):** `src/reconciliation/reconciliation.service.ts`
- **Síntoma:** Al arrancar la app, `wallet_transactions` crece sin control. Con N órdenes en estado `'pending'`, se insertan N registros cada segundo. La BD se llena en minutos con registros inútiles. El README reporta este síntoma: "la base de datos crece sin control apenas arranca".
- **Causa raíz:** `setInterval(() => this.reconcilePendingOrders(), 1000)` en `onModuleInit` ejecuta la reconciliación cada segundo. Además, si la función tarda más de 1 segundo (BD con carga), las ejecuciones se solapan generando concurrencia incontrolada. El módulo importa `ScheduleModule` pero no lo usaba.
- **Fix:** Reemplazar `setInterval` + `OnModuleInit` por `@Cron(CronExpression.EVERY_MINUTE)` de `@nestjs/schedule`. El scheduler de NestJS evita ejecuciones solapadas y se integra con el ciclo de vida del módulo.
- **Prevención:** Nunca usar `setInterval` en `OnModuleInit` para tareas recurrentes en NestJS; usar siempre `@Cron`. Agregar un test que verifique que la reconciliación no crea duplicados.

---

## Bug 13 — Reconciliación no es idempotente: duplica registros por orden

- **Nivel:** 2
- **Archivo(s):** `src/reconciliation/reconciliation.service.ts`
- **Síntoma:** Una orden `'pending'` que lleva 5 minutos genera 300 registros de reconciliación idénticos (con `setInterval` de 1 seg) o al menos uno por cada ejecución del cron aunque la orden ya fue flaggeada antes.
- **Causa raíz:** `reconcilePendingOrders()` creaba una `WalletTransaction` nueva para cada orden `'pending'` en cada ejecución, sin verificar si ya existía un registro de reconciliación para esa orden. La función nunca marcaba la orden como procesada.
- **Fix:** Antes de insertar, verificar `await this.txModel.exists({ orderId, type: 'reconciliation' })`. Si ya existe, se omite. Esto hace la operación idempotente: se puede ejecutar N veces y el resultado es el mismo que ejecutarla una vez.
- **Prevención:** Toda tarea de background que procese registros debe ser idempotente por diseño. Agregar un índice único compuesto `{ orderId: 1, type: 1 }` en `wallet_transactions` como segunda línea de defensa.

---

## Bug 14 — N+1 queries en create() y pay()

- **Nivel:** 3
- **Archivo(s):** `src/orders/orders.service.ts`
- **Síntoma:** Una orden con 10 ítems genera 10 queries a MongoDB en `create()` y otras 10 en `pay()` (más 10 writes individuales para el stock). Con carga, cada llamada produce decenas de roundtrips innecesarios a la BD.
- **Causa raíz:** `for (const item of dto.items) { await this.productModel.findById(...) }` ejecuta una query por iteración en lugar de una sola query batch. En `pay()`, también se usaba `product.save()` individual por cada ítem.
- **Fix:** Batch-fetch con `this.productModel.find({ _id: { $in: productIds } })` y un `Map` para lookup O(1). Para los writes del stock en `pay()`, usar `productModel.bulkWrite()` con una operación `updateOne` por ítem en una sola llamada a la BD.
- **Prevención:** Code review checklist: `await` dentro de un `for...of` sobre un array de IDs es casi siempre un N+1. Usar siempre `$in` + `Map` para fetch y `bulkWrite` para updates múltiples.

---

## Bug 15 — Índices faltantes en campos de filtro frecuentes

- **Nivel:** 3
- **Archivo(s):** `src/orders/schemas/order.schema.ts` · `src/wallet/schemas/wallet-transaction.schema.ts`
- **Síntoma:** En producción con miles de órdenes, `find({ status: 'pending' })` en la reconciliación hace un full collection scan cada minuto. `find({ orderId, type: 'reconciliation' })` también hace full scan por `wallet_transactions`.
- **Causa raíz:** Los schemas de `Order` y `WalletTransaction` no definían índices sobre los campos usados en queries frecuentes (`status`, `userId`, `orderId`). Solo `Wallet.userId` tenía índice por su `unique: true`.
- **Fix:** Agregar `OrderSchema.index({ userId: 1 })` y `OrderSchema.index({ status: 1 })` en `order.schema.ts`. Agregar `WalletTransactionSchema.index({ userId: 1 })`, `index({ orderId: 1 })` e `index({ orderId: 1, type: 1 })` en `wallet-transaction.schema.ts`.
- **Prevención:** Definir índices en el schema desde el día 1 para todos los campos que aparecen en cláusulas `find()`, `findOne()` o `findOneAndUpdate()`. Revisar con `db.collection.explain('executionStats')` en staging antes de cada release.
