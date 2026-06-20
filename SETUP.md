# Guía de arranque y prueba manual

## Opción A — Docker (producción local)

**Requisitos:** Docker Desktop corriendo.

```bash
# Primera vez o cuando cambia el código
docker compose up --build

# Siguientes veces (imagen ya construida)
docker compose up
```

La API queda disponible en `http://localhost:3000`.

### Comandos útiles

```bash
# Correr en background
docker compose up --build -d

# Ver logs de la app en vivo
docker compose logs -f app

# Bajar todo
docker compose down

# Bajar y borrar datos de Mongo (reset total)
docker compose down -v

# Reconstruir sin caché (si algo raro pasa con la imagen)
docker compose build --no-cache && docker compose up
```

---

## Opción B — Local (sin Docker)

**Requisitos:** Node 20+, MongoDB corriendo en `localhost:27017`.

```bash
npm install
npm run start:dev
```

---

## Tests

```bash
# Correr todos los tests
npm test

# Con detalle por test
npx jest --verbose

# Modo watch (re-corre al guardar)
npx jest --watch
```

---

## Flujo de prueba manual completo

Reemplazá `PEGA_ID_AQUI` y `PEGA_ORDER_ID_AQUI` con los valores reales que devuelve cada llamada.

### 1. Ver productos disponibles

```powershell
Invoke-RestMethod http://localhost:3000/products
```

### 2. Recargar saldo (topup)

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/wallet/topup" -Headers @{"x-user-id"="user1"} -ContentType "application/json" -Body '{"amountCents": 5000}'
```

### 3. Ver saldo actual

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/wallet" -Headers @{"x-user-id"="user1"}
```

### 4. Crear una orden

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/orders" -Headers @{"x-user-id"="user1"} -ContentType "application/json" -Body '{"items": [{"productId": "PEGA_ID_AQUI", "qty": 1}]}'
```

### 5. Ver detalle de la orden

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/orders/PEGA_ORDER_ID_AQUI" -Headers @{"x-user-id"="user1"}
```

### 6. Pagar la orden

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/orders/PEGA_ORDER_ID_AQUI/pay" -Headers @{"x-user-id"="user1"}
```

---

## Notas

- El header `x-user-id` simula la autenticación. Podés usar cualquier string como ID de usuario.
- Los datos de Mongo persisten en el volumen `mongo_data` mientras no hagas `docker compose down -v`.
- El módulo de reconciliación corre cada minuto en segundo plano y loguea órdenes en estado `pending` que llevan tiempo sin pagarse.
