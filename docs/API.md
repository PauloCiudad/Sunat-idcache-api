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
  "datePeru": "20/08/2026"
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

Autentica, consulta SUNAT e inserta los resultados en Oracle. Sin body o con `{}` usa el día anterior a la fecha actual de Lima. Para consultar otra fecha:

```json
{
  "date": "19/08/2026"
}
```

`date` debe tener el formato exacto `DD/MM/YYYY`.

```json
{
  "ok": true,
  "date": "19/08/2026",
  "trigger": "manual",
  "received": 8,
  "inserted": 8,
  "attempts": 1,
  "durationMs": 9150
}
```

- `received`: registros presentes en `resultado` de SUNAT.
- `inserted`: filas confirmadas por Oracle.
- `attempts`: intento que terminó correctamente.
- `trigger`: `manual` para HTTP o `scheduled` para el scheduler.

## POST /api/sunat/detracciones/hoy

Alias compatible de `/api/sunat/sync/today`. Acepta el mismo body y devuelve la misma respuesta.

Los nombres de ambas rutas se conservan por compatibilidad. Aunque contienen `today` o `hoy`, si no se envía `date` consultan el día anterior.

## Errores

Una clave ausente o incorrecta recibe HTTP 401. Los errores del flujo SUNAT u Oracle reciben HTTP 502:

```json
{
  "ok": false,
  "message": "No se pudo completar la operación",
  "detail": "detalle técnico disponible en development"
}
```

En `NODE_ENV=production` se omite `detail`. El error completo queda en stdout/stderr.
