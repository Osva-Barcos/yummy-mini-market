# 🍔 yummy-mini-market — Prueba Técnica Backend

> **Rol:** Backend Engineer (Marketplace) · **Nivel:** Junior / Mid
> **Tiempo:** 2 días máximo · **Modalidad:** offline, desde casa · **Defensa:** sesión en vivo al entregar.

## 📖 Contexto

Heredaste este microservicio de un desarrollador que ya no está en el equipo. Es el backend de un **mini-marketplace** (productos, órdenes y wallet de usuario). Funcionaba "a medias" y nos llegaron varios reportes raros desde producción:

- 😱 El servicio **ni siquiera levanta** cuando intentamos correrlo con Docker.
- 📈 Alguien notó que **la base de datos crece sin control** apenas arranca la app.
- 💸 Hay reportes de **saldos y stock que no cuadran**.
- 🔓 Soporte reportó que **un usuario vio una orden que no era suya**.

Tu misión: **levantar el proyecto, encontrar los bugs, arreglarlos y documentarlos.** No es una app perfecta con un solo error: hay **varios problemas, de distinta dificultad**, repartidos por las capas de infra, datos, lógica de negocio y calidad.

---

## 🧱 Stack

- **NestJS** (Node.js + TypeScript)
- **MongoDB** + **Mongoose**
- **Docker** / docker-compose
- **Jest** + supertest (tests e2e con `mongodb-memory-server`)

---

## 🚀 Cómo correr el proyecto

### Opción A — Con Docker (así esperamos correrlo nosotros)

```bash
docker compose up --build
```

> ⚠️ Tal cual está, esto **falla**. Parte de la prueba es lograr que levante. Cuando lo arregles, la API debe quedar disponible en `http://localhost:3000`.

### Opción B — Local (necesitas un MongoDB corriendo en `localhost:27017`)

```bash
npm install
npm run start:dev
```

### Tests

```bash
npm test
```

> Algunos tests están **en rojo a propósito**: describen el comportamiento correcto que hoy no se cumple. Tu trabajo es hacerlos pasar (sin borrarlos ni vaciarlos) y, si lo ves necesario, **agregar los tuyos**.

---

## 📡 API y comportamiento esperado

Todas las rutas reciben el usuario autenticado mediante el header **`x-user-id`** (simulamos auth así para simplificar).

| Método | Ruta | Comportamiento esperado |
|---|---|---|
| `GET` | `/products` | Devuelve el catálogo de productos. |
| `POST` | `/wallet/topup` | Recarga saldo. Body: `{ "amountCents": 5000 }`. |
| `GET` | `/wallet` | Devuelve la wallet del usuario (`x-user-id`). |
| `POST` | `/orders` | Crea una orden. Body: `{ "items": [{ "productId": "...", "qty": 2 }] }`. Calcula el total. |
| `POST` | `/orders/:id/pay` | Paga la orden con el saldo de la wallet: descuenta saldo y stock, y marca la orden como `paid`. |
| `GET` | `/orders/:id` | Devuelve el detalle de **una orden del propio usuario**. |

### Reglas de negocio que el servicio DEBE cumplir

1. **Validación de entrada:** no se aceptan cantidades inválidas (p. ej. `qty` ≤ 0). Una entrada inválida debe responder `400`, nunca generar una orden con total negativo.
2. **Stock:** nunca se puede vender más stock del disponible. El stock no puede quedar negativo.
3. **Saldo:** un usuario nunca puede gastar más de lo que tiene. El saldo no puede quedar negativo, **ni siquiera ante operaciones concurrentes** (pagos simultáneos / doble click).
4. **Seguridad:** un usuario **solo** puede ver sus propias órdenes. Pedir la orden de otro usuario debe responder `404`.
5. **Errores:** un pago que falla **no** puede reportar éxito. Los errores deben ser visibles (logs / status correcto), no silenciosos.
6. **Procesos en segundo plano:** la conciliación de órdenes pendientes debe ser **eficiente e idempotente** — no debe escribir registros duplicados ni saturar la base de datos al arrancar.
7. **Rendimiento:** las consultas deben ser razonables (evitar consultas repetidas en bucle / N+1 y faltas de índices en campos por los que se filtra).

> Estas reglas son tu mapa: donde el comportamiento real **no** cumpla una de ellas, hay un bug.

---

## 🎯 Niveles de dificultad

Los problemas están repartidos en **3 niveles**. No esperamos que todos resuelvan los tres niveles completos — pero **documenta todo lo que encuentres**, aunque no llegues a arreglarlo.

- **Nivel 1 — Bloqueantes:** sin esto la app no corre (infra / arranque).
- **Nivel 2 — Core:** lógica de negocio, datos y seguridad.
- **Nivel 3 — Bonus (mid+):** rendimiento y calidad.

---

## 📦 Qué debes entregar

1. **Tu propio repositorio en GitHub (público)** con la solución:
   - Sube este proyecto **con tus fixes** a un repositorio **tuyo** en GitHub.
   - El repo debe ser **público** (o, si lo prefieres privado, dar acceso a quienes te indiquen).
   - Compártenos el **link del repositorio**.
   - Si tu solución requiere **variables de entorno** (cualquier valor fuera de lo que ya trae `.env.example`), inclúyelas en el correo de entrega o en un `.env.example` actualizado. **No subas secretos reales al repo.**
   - El proyecto debe levantar con `docker compose up --build` sin pasos manuales extra.
2. **`BUGS.md`** — por cada bug encontrado, en 3–4 líneas:
   - **Síntoma** (qué se observa)
   - **Causa raíz** (por qué pasa)
   - **Fix** (qué cambiaste)
   - **Prevención** (cómo evitarías que vuelva a pasar)
3. **Tests** — los que estaban en rojo, en verde (sin trampas), y al menos **1–2 tests propios** que reproduzcan algún bug que hayas encontrado.

> 💡 El `BUGS.md` es la base de tu **defensa oral**: prepárate para explicar el *porqué* de cada decisión, no solo el *qué*.

---

## ✅ Cómo te evaluamos (resumen)

- Que la app levante y funcione.
- Cantidad y **calidad** de los bugs resueltos (solución correcta vs. parche).
- Profundidad del `BUGS.md` (entender la causa raíz).
- Tests.
- Claridad al defender tus decisiones.

¡Éxitos! 🚀
