---
name: document-bug
description: Documenta un bug (encontrado o corregido en este repo) como una nueva entrada en BUGS.md, siguiendo exactamente el formato existente. Usar cuando se corrige un bug, se aplica un hallazgo de backend-standards-reviewer, o el usuario pide "documenta esto en BUGS.md" / "agrega este bug".
---

# Documentar un bug en BUGS.md

Este repo (`yummy-mini-market`) cataloga cada bug encontrado/corregido como una entrada numerada en `BUGS.md`. Esta skill evita tener que releer todo el archivo cada vez: acá está el formato exacto y las reglas para agregar una entrada nueva sin romper las existentes.

## Antes de escribir

1. Determiná el próximo número de bug: `grep -c "^## Bug " BUGS.md` te da el total actual → la nueva entrada es `N+1`. Nunca renumerés ni edites entradas existentes.
2. Identificá el/los archivo(s) y línea(s) concretas ya corregidos (`archivo.ts:línea`). Si ya hay un test que cubre el caso (en `test/*.e2e-spec.ts`), anotá su nombre para referenciarlo en "Prevención".
3. Si el hallazgo vino de un review (ej. subagente `backend-standards-reviewer`), decilo explícito en el "Síntoma" ("Detectado en revisión con `backend-standards-reviewer`") — así se distingue de los bugs originales de la prueba técnica.

## Niveles (Nivel)

Seguí esta convención, ya usada en los 22 bugs existentes — no la de "critical/high/medium/low" que usa el subagente reviewer, hay que traducirla:

- **1 — bloqueante**: rompe el arranque/build/infra (Docker, tsconfig, conexión a Mongo). La app no levanta.
- **2 — core**: bug de lógica de negocio, integridad de datos, seguridad (IDOR) o race condition financiera/de inventario. La app levanta pero produce resultados incorrectos o inseguros.
- **3 — bonus/performance**: N+1, índices faltantes, hardening menor (validación de headers/params), idempotencia de creación. No corrompe datos por sí solo pero degrada calidad/seguridad/performance.

Mapeo de severidad del reviewer → Nivel: `critical`/`high` → 2 (si es lógica de negocio/seguridad) o 1 (si tumba infra); `medium` → 2 o 3 según impacto; `low` → 3.

## Formato exacto de cada entrada

```markdown
## Bug N — Título corto en modo "síntoma", no "causa"

- **Nivel:** 1 | 2 | 3
- **Archivo(s):** `ruta/al/archivo.ts` → `nombreDeFuncion()` (si aplica, agregar más de un archivo separado por `·`)
- **Ubicación en código:** [ruta/al/archivo.ts:LINEA](ruta/al/archivo.ts#LLINEA) (link con ancla de GitHub; si son varios puntos, separar con `·`)
- **Síntoma:** Qué se observa desde afuera (request/respuesta, dato corrupto, log). 2-4 oraciones, concreto, con inputs/escenario específico — no "podría fallar" sino "con inputs X e Y concurrentes, pasa Z".
- **Causa raíz:** Por qué pasa, a nivel de código (qué patrón está mal — read-modify-write, falta de validación, query sin filtro de ownership, etc).
- **Fix:** Qué se cambió concretamente (nombrar el operador/patrón: `findOneAndUpdate` con `$gte`+`$inc`, `bulkWrite`, decorador nuevo, índice nuevo, etc). Si agregaste un test, nombralo aquí.
- **Prevención:** Regla general para que no vuelva a pasar + qué test/CI check lo detectaría. Si ya existe un test que lo cubre, referenciarlo con su nombre entre backticks.
```

Cada entrada termina con una línea `---` antes de la siguiente (mismo separador que todas las existentes).

## Dónde insertar

Siempre al final del archivo, después de la última entrada existente y su `---`. No reordenar por severidad ni por archivo — el orden es cronológico por número.

## Qué NO hacer

- No inventar métricas ni escenarios que no verificaste corriendo el código o leyéndolo con cuidado.
- No documentar como "bug nuevo" algo que ya está cubierto por una entrada existente — buscar primero (`grep -i` por el nombre del archivo/función) antes de agregar.
- No tocar el resto de `BUGS.md` (no renumerar, no reformatear entradas previas) salvo que el usuario lo pida explícitamente.
- No agregar la entrada sin haber aplicado el fix real en el código — esta skill documenta, no reemplaza escribir el fix ni los tests.

## Ejemplo de referencia

Ver los Bugs 18-22 en `BUGS.md` (hallazgos de una revisión con `backend-standards-reviewer`, aplicados y documentados con este mismo formato) como plantilla más fresca que los Bugs 1-17 (los originales de la prueba técnica).
