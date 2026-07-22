# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`yummy-mini-market` is a NestJS + MongoDB backend take-home exercise ("prueba técnica"): products, orders, and a per-user wallet for a mini-marketplace. The original repo shipped with 17 intentional bugs spanning infra/startup, data integrity, business logic, security (IDOR), and performance; a further round of self-review (via the `backend-standards-reviewer` agent) turned up 5 more (Bugs 18–22: unchecked `bulkWrite` result, N+1 in the reconciliation cron, missing `x-user-id` validation, unvalidated `:id` route params, and missing create-order idempotency), for 22 total. Every bug is catalogued in `BUGS.md` (symptom / root cause / fix / prevention, with file:line references) and all have already been fixed in this working copy — inline comments in the source (`// Bug N: ...`) explain what was wrong and why the current code is written the way it is. Read `BUGS.md` before touching `orders.service.ts`, `wallet.service.ts`, `reconciliation.service.ts`, the `Dockerfile`, or `tsconfig.json` — the "obvious simplification" you're tempted to make may be reintroducing a bug that was deliberately fixed.

`README.md` (Spanish) has the original assignment brief and the API contract; `SETUP.md` has manual `curl`/PowerShell smoke-test flows; `TESTS.md` documents what each e2e test covers and, importantly, *why some known bugs have no direct test* (e.g. Docker build issues, the reconciliation cron interval — see its "sin test directo" table before assuming a bug is untested by mistake).

## Commands

```bash
npm install
npm run start:dev        # local dev, requires MongoDB on localhost:27017
npm run build            # nest build -> dist/
npm run start:prod       # node dist/main.js

npm test                 # full e2e suite (jest, uses mongodb-memory-server, no real Mongo needed)
npx jest --verbose        # same, with per-test output
npx jest --watch           # watch mode
npx jest test/orders.e2e-spec.ts   # run a single spec file
npx jest -t "IDOR"          # run tests matching a name pattern

docker compose up --build   # full stack (app + mongo), API on http://localhost:3000
docker compose down -v      # tear down and wipe the mongo_data volume
```

There is no separate lint script and no unit-test layer — `test/` is e2e-only (`*.e2e-spec.ts`), driven by real NestJS module wiring against an in-memory Mongo instance rather than mocks.

## Architecture

**Module layout** mirrors the domain: `products/`, `orders/`, `wallet/`, `reconciliation/`, each a self-contained Nest module (controller + service + Mongoose schema). `AppModule` (`src/app.module.ts`) wires them together and registers `MongooseModule.forRoot(process.env.MONGO_URI ?? 'mongodb://localhost:27017/market')` and `ScheduleModule`.

**Auth is a header, not a real auth system**: every endpoint reads the caller's identity from the `x-user-id` header (no session/JWT), via the `@UserId()` param decorator (`src/common/decorators/user-id.decorator.ts`) — use it instead of `@Headers('x-user-id')` directly, since it throws `UnauthorizedException` (401) when the header is missing/empty rather than letting `undefined` flow into ownership checks or Mongo filters (Bug 20). It isn't applied as a global guard because `ProductsController` is intentionally public. Any handler that returns or mutates a user-owned resource (an order, a wallet) *must* filter or verify ownership using that header value server-side — see `OrdersService.findOneForUser` and `OrdersService.pay`, both of which throw `NotFoundException` (404, not 403 — deliberately, to avoid confirming a resource's existence to a non-owner) when `order.userId !== userId`. Similarly, any `@Param('id')` used directly in a Mongoose query (`findById`, etc.) must go through `ParseObjectIdPipe` (`src/common/pipes/parse-object-id.pipe.ts`) — an invalid ObjectId string reaching `findById` raises an unhandled Mongoose `CastError` that becomes a 500 instead of a clean 400 (Bug 21).

**`src/app-setup.ts`** (`configureApp`) is the single source of truth for global Nest config (currently the `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true`). It's called from both `main.ts` (real bootstrap) and `test/test-app.ts` (`createTestApp`, used by every e2e spec) so tests and production always validate identically. Any new global pipe/filter/interceptor belongs here, not in `main.ts` directly. `test/test-app.ts` boots a NestJS app against `mongodb-memory-server` with `ProductsModule`/`OrdersModule`/`WalletModule` only — `ReconciliationModule` is intentionally excluded so tests stay deterministic (no cron firing mid-test). `test/reconciliation.e2e-spec.ts` still covers `ReconciliationService` logic by instantiating it directly against the test models rather than going through the module/`@Cron` — follow that same pattern for any future test that needs to exercise a `@Cron` job's body without triggering the scheduler.

**Money/inventory invariants are enforced with atomic Mongo operations, not application-level locking.** The established pattern (see `OrdersService.pay` in `src/orders/orders.service.ts`) is: `findOneAndUpdate` with the invariant as part of the *filter* (e.g. `{ balanceCents: { $gte: total } }`) and the mutation as `$inc` in the same call, so the check-then-write is a single atomic document operation immune to race conditions from concurrent requests. Stock decrements use `bulkWrite` with a `{ stock: { $gte: qty } }` filter per item for the same reason. Follow this pattern for any new code that debits balance or stock — a plain read → compare in JS → `.save()` reintroduces a race (this is exactly what Bug 10/Bug 16 in `BUGS.md` were). Note `WalletService.topup` (`src/wallet/wallet.service.ts`) still uses the older read-modify-write style (flagged in-line as `//problema de atomicidad`) — it isn't currently exploitable for double-spend the way `pay()` was, but don't copy it as a reference pattern.

**Retry-safe creation uses an optional client-supplied idempotency key, backed by a DB constraint, not app-level dedup.** `OrdersService.create` accepts an optional `idempotencyKey` in `CreateOrderDto`, stored on `Order` behind a unique + sparse index `{ userId: 1, idempotencyKey: 1 }`. On create, it first looks up an existing order for that `(userId, idempotencyKey)` pair (fast path for serial retries); if the insert still races another concurrent request with the same key, it catches the unique-index violation and returns the order the other request created instead of propagating a duplicate-key error (Bug 22). Any new creation endpoint exposed to client retries (double-click, network retry) should follow this same shape — invariant enforced by a DB index, not just in-memory checks.

**Batch fetching over N+1**: both `create()` and `pay()` in `OrdersService` fetch all products for an order's line items in one `find({ _id: { $in: productIds } })` + `Map` lookup, rather than one query per item. Preserve this when touching order logic.

**Background jobs use `@nestjs/schedule`'s `@Cron`, never `setInterval`/`OnModuleInit`.** `ReconciliationService.reconcilePendingOrders` runs `@Cron(CronExpression.EVERY_MINUTE)` and must stay idempotent: it guards every insert with `txModel.exists({ orderId, type: 'reconciliation' })` before creating a `WalletTransaction`, so repeated runs don't duplicate records. Any new scheduled task should follow the same idempotent-guard-before-write shape.

**Indexes matter here on purpose**: `Order` is indexed on `userId` and `status`; `WalletTransaction` is indexed on `userId`, `orderId`, and the compound `{ orderId: 1, type: 1 }` (this compound index exists specifically to back the reconciliation idempotency check above). Add an index whenever you add a new `find`/`findOne`/`findOneAndUpdate` filter field used in a hot path.

**Validation**: DTOs (`src/**/dto/*.dto.ts`) use `class-validator`/`class-transformer` decorators (`@IsInt`, `@Min`, `@IsMongoId`, `@ValidateNested` + `@Type`, etc.) and are only effective because of the global `ValidationPipe` in `app-setup.ts`. Never type a `@Body()` param as an inline object type (`{ amountCents: number }`) — the pipe only validates classes carrying `reflect-metadata`, so inline types silently skip validation entirely.

**tsconfig note**: `compilerOptions.types` is explicitly `["jest", "node"]`. If you ever touch this list, remember that restricting `types` drops *all* unlisted `@types/*` globals (this previously broke `process`/`Buffer` in production code — Bug 17 — while `npm test` stayed green because `mongodb-memory-server`'s Node-module type deps masked the gap only in the test environment, which doesn't share `tsconfig.build.json`'s file exclusions).

**Docker build is multi-stage** (`Dockerfile`): stage 1 (`builder`) runs full `npm ci` + `npm run build`; stage 2 copies only `dist/` and runs `npm ci --omit=dev`. Don't collapse this into a single stage — `nest build` requires `@nestjs/cli`, which is a devDependency and must not ship in the runtime image.
