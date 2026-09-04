# Operación y despliegue

## Arranque

```powershell
npm start
```

La secuencia de inicio es:

1. Carga y valida `.env`.
2. Crea el pool Oracle.
3. Comprueba que las columnas de la tabla de log sean visibles.
4. Abre la API en `0.0.0.0:PORT`.
5. Registra la tarea cron.

Si Oracle no está disponible o falta la tabla de log, el proceso falla antes de exponer la API y antes de programar cargas.

Para detenerlo use `Ctrl+C` o envíe `SIGTERM`. El cierre detiene el scheduler y cierra el navegador y el pool Oracle.

## Scheduler

La configuración predeterminada es:

```env
SYNC_CRON=0 5,16 * * *
SYNC_TIMEZONE=America/Lima
SYNC_RETRIES=3
```

A las 05:00 y 16:00 se calcula el día anterior en Lima. Esa fecha se envía tanto en `fechaInicio` como en `fechaFin`. Ambas ejecuciones del 04/09/2026 consultan el 03/09/2026. Las llamadas manuales consultan el día actual.

`noOverlap` espera la promesa completa del proceso. `SyncService` rechaza otra ejecución simultánea (HTTP 409 en manuales), para no devolver al solicitante un resultado con otra fecha o trigger.

Estas protecciones son locales. Si se levantan dos instancias del servicio, ambas podrían insertar la misma información. Para alta disponibilidad se necesita un bloqueo distribuido externo.

## Reintentos

Un fallo en autenticación, consulta o inserción activa el reintento si es seguro repetir. Con `SYNC_RETRIES=3` hay un intento inicial y tres reintentos adicionales. No se reintentan automáticamente el package, el log ni un COMMIT sin confirmación.

La inserción usa transacción. Si Oracle falla antes del `COMMIT`, el intento hace `ROLLBACK`. Sin embargo, el sistema no deduplica ejecuciones ya confirmadas; no relance una fecha sin revisar antes la tabla.

## Logs

Todos los logs son JSON de una línea. Eventos principales:

`loggedAt` reemplaza al antiguo `timestamp` UTC y usa `YYYY/MM/DD HH24:MI:SS` en Lima. `date` indica cuándo comenzó la ejecución y `queryDate` el día de SUNAT.

| Evento | Significado |
|---|---|
| `server.started` | API escuchando. |
| `scheduler.started` | Cron registrado. |
| `sunat.auth.success` | Se obtuvo sesión SOL. |
| `sunat.auth.failed` | Falló navegación, login o captura de `idCache`. |
| `sunat.detracciones.received` | SUNAT respondió; `records` indica cantidad. |
| `sync.started` | Comenzó una ejecución. |
| `sync.attempt.started` | Comenzó un intento. |
| `sync.retry` | Se programó otro intento. |
| `sync.package.started` / `sync.package.completed` | Inicio y confirmación del package. |
| `sync.log.failed` | No pudo guardarse el resultado en la tabla de log. |
| `sync.rejected` | Fecha manual no permitida o ejecución concurrente. |
| `sync.completed` | Consulta e inserción finalizaron. |
| `sync.failed` | Se agotaron los intentos. |
| `server.shutdown.completed` | Recursos cerrados. |

Ejemplo:

```json
{"loggedAt":"2026/09/04 05:00:12","level":"info","event":"sync.completed","ok":true,"date":"2026/09/04 05:00:00","queryDate":"2026/09/03 00:00:00","received":1,"inserted":1}
```

No se usa `SUNAT_SYNC_LOG`. El resultado final, exitoso o fallido, se guarda en `Z10.LOG_PROCESO_DETRACCIONES`. Si Oracle no está disponible, el log sólo puede quedar en stdout/stderr; supervise `sync.log.failed`.

Antes de desplegar, el DBA debe ejecutar [la creación de la tabla de log](../sql/001_log_proceso_detracciones.sql). No se ejecuta DDL automáticamente. El usuario de la API necesita `INSERT` sobre el log y `EXECUTE` sobre el package.

`DURACION` conserva milisegundos de carga y procesamiento (antes del log). `DIA` es un `DATE` con fecha/hora de inicio en Lima, también para errores. Para mostrarlo use `TO_CHAR(DIA, 'YYYY/MM/DD HH24:MI:SS')`.

## Verificación operativa

Después de desplegar:

1. Ejecute `npm run db:ping`.
2. Inicie el servicio y pruebe `GET /api/health`.
3. Ejecute manualmente con `{}` para consultar hoy.
4. Compruebe que `received` e `inserted` coinciden.
5. Revise `LOG_PROCESO_DETRACCIONES` y las tablas definitivas: WORK puede estar vacía porque el package la limpia.
6. Revise que aparezca `scheduler.started` con cron y zona correctos.

## Recomendaciones de producción

- Ejecute una sola instancia mientras no exista un bloqueo distribuido.
- Use `HEADLESS=true`.
- Mantenga reloj y zona horaria del host sincronizados.
- Permita salida HTTPS a gob.pe y dominios `sunat.gob.pe`.
- Supervise `sync.failed` y ausencia de `sync.completed` después de las 05:00 y 16:00.
- Rote la Clave SOL y `API_KEY` según la política de la organización.
