# Arquitectura del sistema

```text
SUNAT Login ──Playwright──> AuthService ──idCache──┐
                                                   │
SUNAT API ──────Axios─────> SunatClient <──────────┘
                                │
                         SyncService + Retry
                                │
                    DetraccionesRepository
                                │ node-oracledb
                                ▼
                  Z10.W_DETRACCIONES_AUTO
```

## Componentes

- `AuthService`: abre el trámite, inicia sesión con Clave SOL y obtiene `idCache`
  desde el response `GET /v1/gestor-sesiones/recurso`, junto con las cookies de
  la sesión que necesita el cliente HTTP.
- `SunatClient`: consulta las detracciones con Axios enviando los headers
  `Idcache: <idCache>`, `Idformulario: *MENU*` y la cookie de sesión SOL.
- `SyncService`: coordina autenticación, consulta e inserción. Impide dos
  ejecuciones simultáneas dentro del mismo proceso.
- `DetraccionesRepository`: usa `executeMany` dentro de una transacción Oracle.
  Sólo ejecuta `INSERT`; no realiza `MERGE` ni deduplicación.
- `Retry`: permite tres reintentos adicionales después del primer fallo.
- `Scheduler`: ejecuta la sincronización todos los días a las 02:00 en
  `America/Lima`.
- `Logger`: emite eventos JSON estructurados a stdout/stderr.

## Persistencia

Se insertan las columnas entregadas de `Z10.W_DETRACCIONES_AUTO`, salvo:

- `usr_crea`: no se incluye en el `INSERT` y queda `NULL`.
- `fec_crea`: no se incluye en el `INSERT` y Oracle aplica `DEFAULT SYSDATE`.

Toda la respuesta del día se confirma con un solo `COMMIT`. Ante cualquier
error se ejecuta `ROLLBACK`.

No se utiliza una tabla `SUNAT_SYNC_LOG`. Los eventos `sync.started`,
`sync.retry`, `sync.completed` y `sync.failed` se emiten como logs JSON a
stdout/stderr.

## Endpoints

- `GET /api/health`: estado del servicio.
- `POST /api/sunat/id-cache`: obtiene un `idCache` para diagnóstico.
- `POST /api/sunat/sync/today`: ejecuta la sincronización manual.
- `POST /api/sunat/detracciones/hoy`: alias compatible del endpoint manual.

Los endpoints `POST` requieren el header `x-api-key`.

Para diagnóstico, el endpoint manual admite una fecha opcional:

```json
{ "date": "19/08/2026" }
```

El scheduler no utiliza este valor y siempre calcula el día actual en Lima.

## Programación

Configuración predeterminada:

```env
SYNC_CRON=0 2 * * *
SYNC_TIMEZONE=America/Lima
SYNC_RETRIES=3
```

`SYNC_RETRIES=3` significa un intento inicial más tres reintentos: cuatro
intentos totales como máximo.
