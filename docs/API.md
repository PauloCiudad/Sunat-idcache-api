# API HTTP

URL local predeterminada: `http://localhost:4000`.

## Autenticación y límites

Todos los endpoints `POST` requieren el header:

```http
x-api-key: valor-de-API_KEY
```

El límite es de 5 solicitudes por minuto y por IP. `GET /api/health` es público y no está sujeto a ese límite.

## GET /api/health

Informa si el proceso HTTP está activo. No verifica en cada llamada la sesión SOL ni ejecuta una consulta Oracle.

```json
{
  "ok": true,
  "service": "sunat-detracciones-api",
  "datePeru": "2026/09/04 10:00:00"
}
```

## POST /api/sunat/id-cache

Abre el flujo de autenticación SOL y devuelve el `idCache` encontrado en el response de `GET /v1/gestor-sesiones/recurso`.

```http
POST /api/sunat/id-cache
x-api-key: valor-de-API_KEY
Content-Type: application/json

{}
```

Respuesta:

```json
{
  "idCache": "token-devuelto-por-sunat"
}
```

Este endpoint es sólo de diagnóstico. El valor es temporal y debe tratarse como información sensible.

## POST /api/sunat/sync/today

Autentica, consulta SUNAT, inserta en WORK, llama al package y guarda el log en Oracle. Sin body o con `{}` consulta hoy en Lima:

```json
{}
```

Si se envía `date`, debe coincidir con hoy en Lima, en `DD/MM/YYYY`. Las fechas diferentes reciben HTTP 400 y se registra el rechazo sin insertar detracciones.

```json
{
  "ok": true,
  "date": "2026/09/04 10:00:00",
  "queryDate": "2026/09/04 00:00:00",
  "trigger": "manual",
  "received": 8,
  "inserted": 8,
  "attempts": 1,
  "durationMs": 9150
}
```

- `date`: inicio de la ejecución en Lima, `YYYY/MM/DD HH24:MI:SS`; se guarda en `DIA`.
- `queryDate`: día consultado, con hora `00:00:00` porque la consulta es diaria. En el scheduler es ayer; en manuales es hoy.
- `received`: registros presentes en `resultado` de SUNAT.
- `inserted`: filas confirmadas en WORK antes del package, aunque luego éste las elimine de WORK.
- `attempts`: intento que terminó correctamente.
- `durationMs`: duración de la carga y del package, antes de la escritura del log, en milisegundos.
- `trigger`: `manual` para HTTP o `scheduled` para el scheduler.

## POST /api/sunat/detracciones/hoy

Alias compatible de `/api/sunat/sync/today`. Acepta el mismo body y devuelve la misma respuesta.

Ambas rutas consultan hoy en Lima y ejecutan el mismo flujo.

## POST /api/sunat/sync/range

Consulta un intervalo inclusivo en una sola llamada a SUNAT. Después inserta el resultado completo en WORK, ejecuta el package una vez y guarda un único log.

```http
POST /api/sunat/sync/range
x-api-key: valor-de-API_KEY
Content-Type: application/json
```

```json
{
  "startDate": "01/09/2026",
  "endDate": "04/09/2026"
}
```

Ambos campos son obligatorios y usan `DD/MM/YYYY`. `startDate` debe ser igual o anterior a `endDate`. No se limita el rango a hoy porque este endpoint también permite recuperaciones históricas.

Respuesta típica:

```json
{
  "ok": true,
  "date": "2026/09/04 10:30:00",
  "queryStartDate": "2026/09/01 00:00:00",
  "queryEndDate": "2026/09/04 00:00:00",
  "trigger": "manual_range",
  "received": 64,
  "inserted": 64,
  "attempts": 1,
  "durationMs": 15420
}
```

Para un intervalo se devuelven `queryStartDate` y `queryEndDate` en lugar de `queryDate`. La fila Oracle utiliza `TIPO_REGISTRO=manual_range` y guarda ambas fechas en `DETALLE`.

## Errores

Una clave ausente o incorrecta recibe HTTP 401. Una sincronización concurrente recibe HTTP 409; no comparte el resultado de la ejecución activa. Los errores del flujo SUNAT u Oracle reciben HTTP 502:

```json
{
  "ok": false,
  "date": "2026/09/04 10:00:00",
  "queryDate": "2026/09/04 00:00:00",
  "trigger": "manual",
  "received": 0,
  "inserted": 0,
  "attempts": 4,
  "durationMs": 120000,
  "message": "No se pudo completar la operación",
  "detail": "SUNAT no respondió gestor-sesiones/recurso"
}
```

En `NODE_ENV=production` se omiten `detail` y `logDetail` de HTTP. El log Oracle conserva los detalles técnicos (hasta la longitud de sus columnas).

Cada ejecución guarda un resultado final en `Z10.LOG_PROCESO_DETRACCIONES`, también cuando falla SUNAT. No se inserta un log por cada reintento.

Casos que no deben relanzarse automáticamente:

- Fallo del package: `ok:false`, `inserted` conserva el lote ya cargado y `needsManualReview:true`.
- Respuesta perdida al confirmar el INSERT: `inserted:null`, `needsManualReview:true`; no se conoce el resultado del COMMIT.
- Fallo del log tras procesamiento correcto: `ok:false`, `processed:true`, `logSaved:false`, `needsManualReview:true`. No se repite ni el INSERT ni el package.
- Si fallan tanto la operación como su log: se conserva el error original y se agrega `logSaved:false` y `logDetail`; queda respaldo en consola.

`POST /id-cache` es diagnóstico y no registra un proceso de detracciones. Sus errores sí incluyen `date`, `trigger` y `durationMs`. Los rechazos por API key/rate limit no representan ejecuciones de sincronización.
