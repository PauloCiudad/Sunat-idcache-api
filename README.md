# SUNAT Detracciones API

Servicio Node.js que inicia sesión en SUNAT con Clave SOL, obtiene el `idCache` de la sesión, consulta los pagos individuales de detracciones y los inserta en Oracle.

La sincronización se ejecuta automáticamente a las 05:00 y 16:00, hora de Lima, y también puede iniciarse mediante una API HTTP protegida con `x-api-key`.

## Flujo principal

```text
Clave SOL -> Playwright -> idCache + cookies
                              |
                              v
                    API de detracciones SUNAT
                              |
                              v
                 conversión y validación de datos
                              |
                              v
               INSERT masivo + COMMIT en Oracle
                              |
                              v
       Z10.PKG_C01_DETRACCIONES.PRC_PROCESAR_TODO
                              |
                              v
          Z10.LOG_PROCESO_DETRACCIONES -> respuesta
```

El proceso consulta una sola fecha por ejecución. Las tareas programadas consultan ayer y las llamadas manuales consultan hoy, calculados en `America/Lima`.

## Requisitos

- Node.js 20 o posterior.
- Acceso de red a gob.pe, SUNAT y Oracle.
- Credenciales SOL válidas.
- Un usuario Oracle con permiso de `INSERT` y `SELECT` sobre `{schema}.[TABLE]` (o el esquema configurado).
- Oracle Instant Client de 64 bits para ejecutar `node-oracledb` en Thick mode.
- Chromium de Playwright instalado.

## Instalación rápida

```powershell
npm install
npx playwright install chromium
Copy-Item .env.ejemplo .env
```

Complete `.env` con credenciales reales y valide Oracle:

Antes de iniciar, el DBA debe crear la tabla de log con [este script](sql/001_log_proceso_detracciones.sql) y otorgar los permisos indicados allí. La aplicación no crea tablas automáticamente.

```powershell
npm run db:ping
npm run db:check
npm test
npm start
```

El servicio escucha de forma predeterminada en `http://localhost:4000`.

## Uso básico

Comprobar que el servidor responde:

```powershell
Invoke-RestMethod http://localhost:4000/api/health
```

Ejecutar la sincronización manual del día actual en Lima:

```powershell
$headers = @{ "x-api-key" = "SU_API_KEY" }
Invoke-RestMethod -Method Post `
  -Uri http://localhost:4000/api/sunat/sync/today `
  -Headers $headers `
  -ContentType "application/json" `
  -Body "{}"
```

No es necesario enviar `date`. Si se envía, sólo se acepta la fecha de hoy en `DD/MM/YYYY`; otra fecha responde HTTP 400 sin cargar datos.

Consultar un rango histórico inclusivo:

```powershell
$body = @{ startDate = "01/09/2026"; endDate = "04/09/2026" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri http://localhost:4000/api/sunat/sync/range `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

El rango genera una sola consulta SUNAT, un INSERT masivo, una llamada al package y una fila de log.

Respuesta correcta típica:

```json
{
  "ok": true,
  "date": "2026/09/04 10:00:00",
  "queryDate": "2026/09/04 00:00:00",
  "trigger": "manual",
  "received": 1,
  "inserted": 1,
  "attempts": 1,
  "durationMs": 8432
}
```

`date` es la fecha/hora de ejecución, `queryDate` el día consultado y `durationMs` la duración de carga y procesamiento en milisegundos (antes de guardar el log). Las fechas de salida usan `YYYY/MM/DD HH24:MI:SS`, en Lima.

> La carga a WORK sigue usando sólo `INSERT`, sin `MERGE`. Después, el package transfiere los registros, limpia **toda** la tabla WORK y confirma su propia transacción. `inserted` cuenta filas cargadas a WORK, no las filas que quedan allí ni las insertadas por el package en las tablas definitivas.

## Comandos

| Comando | Función |
|---|---|
| `npm start` | Inicia API y scheduler. |
| `npm run dev` | Inicia en modo observación. |
| `npm test` | Ejecuta pruebas unitarias. |
| `npm run db:ping` | Comprueba la conexión Oracle. |
| `npm run db:check` | Muestra identidad de sesión y estado de la tabla. |

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [API HTTP](docs/API.md)
- [Configuración](docs/CONFIGURATION.md)
- [Base de datos y mapeo](docs/DATABASE.md)
- [Operación y despliegue](docs/OPERATIONS.md)
- [Desarrollo y pruebas](docs/DEVELOPMENT.md)
- [Solución de problemas](docs/TROUBLESHOOTING.md)
- [Seguridad](docs/SECURITY.md)
