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
  infrastructure/retry.js        política de reintentos
  middleware/api-key.js
  repositories/
    detracciones.mapper.js       normalización SUNAT -> Oracle
    detracciones.repository.js   INSERT masivo transaccional
  routes/sunat.routes.js
  sunat/sunat.client.js          llamada HTTP de detracciones
  sync/
    scheduler.js                 cron
    sync.service.js              orquestación y exclusión local
scripts/
  db-ping.js
  db-check.js
test/
  detracciones.mapper.test.js
  retry.test.js
  sync.service.test.js
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
- consulta manual de una fecha.

Son pruebas unitarias y no usan credenciales reales, navegador ni Oracle. La validación integrada se realiza con `db:ping`, `db:check` y una sincronización manual controlada.

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
- El repositorio es el único que ejecuta SQL de detracciones.

Mantener esos límites facilita probar cambios de SUNAT sin depender de Oracle y viceversa.
