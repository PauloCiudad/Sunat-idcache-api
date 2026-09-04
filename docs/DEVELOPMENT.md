# Desarrollo y pruebas

## Estructura

```text
src/
  app.js                         Express, seguridad y errores HTTP
  server.js                      arranque y cierre ordenado
  container.js                   composición de dependencias
  auth/auth.service.js           login SOL y captura de idCache
  config/env.js                  configuración y validación
  config/database.js             pool Oracle
  controllers/sunat.controller.js
  infrastructure/browser.js      navegador compartido
  infrastructure/logger.js       logs JSON
  infrastructure/datetime.js     fechas y horas de Lima
  infrastructure/retry.js        política de reintentos
  middleware/api-key.js
  middleware/error-handler.js    errores HTTP con contexto de ejecución
  repositories/
    detracciones.mapper.js       normalización SUNAT -> Oracle
    detracciones.repository.js   INSERT masivo transaccional
    process-log.repository.js    log final en Oracle
  routes/sunat.routes.js
  sunat/sunat.client.js          llamada HTTP de detracciones
  sync/
    scheduler.js                 cron
    sync.service.js              orquestación y exclusión local
    sync.error.js                error tipado con resultado y estado HTTP
sql/
  001_log_proceso_detracciones.sql
scripts/
  db-ping.js
  db-check.js
test/
  detracciones.mapper.test.js
  retry.test.js
  sync.service.test.js
  sync.workflow.test.js
  database.workflow.test.js
  datetime.scheduler.http.test.js
```

## Ejecución local

```powershell
npm install
npx playwright install chromium
Copy-Item .env.ejemplo .env
npm run dev
```

Con `HEADLESS=false` puede observar el login durante el diagnóstico.

## Pruebas

```powershell
npm test
```

Las pruebas actuales verifican:

- conversión del payload real de SUNAT;
- normalización de valores vacíos y fechas;
- cantidad total de intentos;
- fecha actual y día anterior en Lima, incluidos cambios de mes y año;
- coordinación entre autenticación, cliente SUNAT y repositorio;
- manuales de hoy y programadas de ayer;
- rangos manuales inclusivos con inicio y fin válidos;
- INSERT seguido del package y luego del log;
- fallos de package/log sin repetir la carga;
- contadores y fecha de errores, concurrencia, COMMIT incierto y límites de texto;
- cron dos veces al día y formato legible de fecha/hora.

Son pruebas unitarias con dobles de Oracle/SUNAT y no modifican datos reales. Una prueba integrada de sincronización requiere preparar la tabla de log y autorización para ejecutar el package, ya que éste limpia toda WORK.

## Cómo modificar el mapeo

Cuando SUNAT agregue o cambie un campo:

1. Actualice `FIELD_ALIASES` y, si corresponde, `NUMBER_FIELDS` en `detracciones.mapper.js`.
2. Agregue la columna a `COLUMNS` y su tipo a `bindDefs` en el repositorio.
3. Ajuste el DDL Oracle antes de desplegar el código.
4. Añada un caso al test del mapper.
5. Ejecute `npm test` y una consulta manual.

Las longitudes de texto se validan antes de abrir la transacción para producir errores entendibles.

## Responsabilidades de cada capa

- El controlador sólo interpreta HTTP.
- `SyncService` decide fecha, reintentos y orden del flujo.
- `AuthService` es el único componente que usa Playwright.
- `SunatClient` conoce el endpoint y headers privados de SUNAT.
- El mapper no accede a red ni base de datos.
- `DetraccionesRepository` ejecuta INSERT y el package; `ProcessLogRepository` inserta el resultado final.

Mantener esos límites facilita probar cambios de SUNAT sin depender de Oracle y viceversa.
