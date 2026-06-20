# Tests automatizados

Suite e2e con Jest + `mongodb-memory-server`. Todos los tests corren contra una instancia
de MongoDB en memoria con la misma configuración global (ValidationPipe) que producción.

```
npx jest --verbose
```

---

## Cobertura por archivo

### `test/products.e2e-spec.ts`

| Test | Qué verifica |
|------|-------------|
| GET /products devuelve el catálogo sembrado | El endpoint de catálogo responde 200 con los productos sembrados |

---

### `test/orders.e2e-spec.ts`

#### Tests heredados (ya existían, estaban en rojo)

| Test | Bug cubierto |
|------|-------------|
| flujo feliz: recargar saldo, crear orden y pagarla | Golden path completo: topup → create → pay → status `paid` |
| rechaza cantidades negativas (no debe permitir total negativo) | Bug 3 + Bug 4 — ValidationPipe activo + DTO con `@Min(1)` |
| un usuario NO puede ver la orden de otro usuario (IDOR) | Bug 6 — IDOR en `GET /orders/:id` devuelve 404 para atacante |
| no permite vender más stock del disponible (oversell) | Bug 11 — stock no puede quedar negativo tras el pago |

#### Tests nuevos (agregados durante el fix)

| Test | Bug cubierto | Qué verifica |
|------|-------------|-------------|
| un usuario NO puede pagar la orden de otro usuario (IDOR pay) | Bug 7 | `POST /orders/:id/pay` con `x-user-id` de otro usuario devuelve 404 antes de tocar la wallet |
| topup rechaza monto negativo o cero | Bug 5 | `amountCents: -500` y `amountCents: 0` devuelven 400 |
| pay con saldo insuficiente devuelve error (no silencio) | Bug 9 + Bug 8 | Sin saldo previo, el pago devuelve 400 en lugar de `{ status: 'ok' }` silencioso |
| los pagos concurrentes no permiten gastar más que el saldo | Bug 10 + Bug 16 | `Promise.all` con dos pagos simultáneos: `wallet.balanceCents >= 0` y `product.stock >= 0` al finalizar |

---

## Bugs sin test directo y por qué

| Bug | Motivo para no testear |
|-----|------------------------|
| Bug 1 — Dockerfile multi-stage | Requiere `docker build` en CI, no jest |
| Bug 2 — URI hardcodeada | El `MongoMemoryServer` abstrae la conectividad; se verifica corriendo `docker compose up` |
| Bug 12 — `setInterval` de 1 segundo | `ReconciliationModule` está excluido del test-app para mantener los tests deterministas (sin scheduler activo) |
| Bug 13 — reconciliación no idempotente | Mismo motivo que Bug 12; la lógica es una sola guarda `txModel.exists()` verificable en code review |
| Bug 14 — N+1 queries | Mejora de performance; no hay assertion de correctitud que falle si se vuelve a N+1 |
| Bug 15 — índices faltantes | Los índices no cambian el resultado, solo la velocidad; se validan con `explain()` en staging |

---

## Arquitectura del helper de tests

`test/test-app.ts` levanta una app NestJS mínima (sin `ReconciliationModule`) contra
`MongoMemoryServer`. Expone los modelos `productModel` y `walletModel` para que los tests
puedan leer el estado de la BD y verificar invariantes post-operación.
