# Operación y despliegue

## Arranque

```powershell
npm start
```

La secuencia de inicio es:

1. Carga y valida `.env`.
2. Crea el pool Oracle.
3. Abre la API en `0.0.0.0:PORT`.
4. registra la tarea cron.

Si Oracle no está disponible, el proceso falla antes de exponer la API.

Para detenerlo use `Ctrl+C` o envíe `SIGTERM`. El cierre detiene el scheduler y cierra el navegador y el pool Oracle.

## Scheduler

La configuración predeterminada es:

```env
SYNC_CRON=0 2 * * *
SYNC_TIMEZONE=America/Lima
SYNC_RETRIES=3
```

A las 02:00 se calcula la fecha actual en Lima y se consulta desde esa misma fecha hasta esa misma fecha.

`noOverlap` evita que la tarea cron se solape dentro del proceso. `SyncService` también comparte la ejecución activa si llega una llamada manual mientras otra sigue en curso.

Estas protecciones son locales. Si se levantan dos instancias del servicio, ambas podrían insertar la misma información. Para alta disponibilidad se necesita un bloqueo distribuido externo.

## Reintentos

Un fallo en autenticación, consulta o inserción activa el reintento. Con `SYNC_RETRIES=3` hay un intento inicial y tres reintentos adicionales.

La inserción usa transacción. Si Oracle falla antes del `COMMIT`, el intento hace `ROLLBACK`. Sin embargo, el sistema no deduplica ejecuciones ya confirmadas; no relance una fecha sin revisar antes la tabla.

## Logs

Todos los logs son JSON de una línea. Eventos principales:

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
| `sync.completed` | Consulta e inserción finalizaron. |
| `sync.failed` | Se agotaron los intentos. |
| `server.shutdown.completed` | Recursos cerrados. |

Ejemplo:

```json
{"level":"info","event":"sync.completed","ok":true,"date":"19/08/2026","received":1,"inserted":1}
```

No hay tabla `SUNAT_SYNC_LOG`. En producción redirija stdout/stderr al sistema de logs de su plataforma y configure retención.

## Verificación operativa

Después de desplegar:

1. Ejecute `npm run db:ping`.
2. Inicie el servicio y pruebe `GET /api/health`.
3. Ejecute manualmente una fecha conocida.
4. Compruebe que `received` e `inserted` coinciden.
5. Consulte `MAX(fec_crea)` directamente en la base.
6. Revise que aparezca `scheduler.started` con cron y zona correctos.

## Recomendaciones de producción

- Ejecute una sola instancia mientras no exista un bloqueo distribuido.
- Use `HEADLESS=true`.
- Mantenga reloj y zona horaria del host sincronizados.
- Permita salida HTTPS a gob.pe y dominios `sunat.gob.pe`.
- Supervise `sync.failed` y ausencia de `sync.completed` después de las 02:00.
- Rote la Clave SOL y `API_KEY` según la política de la organización.

