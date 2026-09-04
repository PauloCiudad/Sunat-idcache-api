# Arquitectura del sistema

## Vista general

```text
                              +------------------+
                              | API / Scheduler  |
                              +---------+--------+
                                        |
                                        v
                              +------------------+
                              |   SyncService    |
                              | fecha + reintento|
                              +---+----------+---+
                                  |          |
                                  v          v
                        +-----------+     +-------------+
                        |AuthService|     |SunatClient  |
                        |Playwright |---->|Axios + sesión|
                        +-----------+     +------+------+
                                                |
                                                v
                                      respuesta resultado[]
                                                |
                                                v
                                     +----------------------+
                                     | Mapper + Repository  |
                                     | executeMany / Oracle |
                                     +----------+-----------+
                                                |
                                                v
                                        {schema}.[TABLE]
```

## Componentes

| Componente | Responsabilidad |
|---|---|
| `server.js` | Valida configuración, crea Oracle, inicia HTTP y cron, y cierra recursos. |
| `app.js` | Configura Express, Helmet, JSON, health check, rate limit y errores. |
| `container.js` | Construye y conecta servicios y controladores. |
| `AuthService` | Abre el trámite, inicia sesión SOL y captura `idCache` y cookies. |
| `SunatClient` | Consulta pagos individuales con los headers de sesión SUNAT. |
| `SyncService` | Coordina fecha, autenticación, consulta, inserción y reintentos. |
| `Scheduler` | Ejecuta la sincronización diaria con zona horaria de Lima. |
| `DetraccionesMapper` | Convierte nombres, vacíos, fechas y números. |
| `DetraccionesRepository` | Inserta el lote en una transacción Oracle. |
| `ProcessLogRepository` | Persiste el resultado final en `Z10.LOG_PROCESO_DETRACCIONES`. |
| `Logger` | Emite eventos JSON a stdout/stderr. |

## Autenticación SUNAT

1. Playwright abre `SUNAT_TRAMITE_URL`.
2. Localiza el enlace “Iniciar trámite”.
3. Navega a su URL en la misma página.
4. Completa RUC, usuario y clave SOL.
5. Antes del login ya escucha responses del contexto.
6. Selecciona el `GET /v1/gestor-sesiones/recurso` que contiene `idCache`.
7. Extrae las cookies de dominios terminados en `sunat.gob.pe`.
8. Cierra el contexto del navegador.

El navegador se reutiliza entre ejecuciones; cada autenticación usa un contexto nuevo y aislado.

## Consulta de detracciones

`SunatClient` envía un `GET` a:

```text
/v1/recaudacion/tributaria/declapago/detracciones/t/consultar
```

Parámetros de negocio:

| Parámetro | Valor |
|---|---|
| `fechaInicio` | fecha de la ejecución, `DD/MM/YYYY` |
| `fechaFin` | la misma fecha |
| `tipoCuenta` | `1` |
| `tipoConsulta` | `pagosIndividuales` |
| `periodo` | vacío |

Las programadas (05:00 y 16:00 de Lima) consultan ayer; las manuales consultan hoy. Una fecha manual diferente de hoy se rechaza. Los parámetros SUNAT mantienen `DD/MM/YYYY`; las fechas expuestas en logs/respuestas usan `YYYY/MM/DD HH24:MI:SS`.

Headers particulares: `Idcache`, `Idformulario: *MENU*`, `Cookie`, `Origin` y `Referer`.

Si `cod` está presente debe ser 200. `resultado` se trata como un arreglo; si no lo es, se considera vacío.

## Persistencia

El repositorio ejecuta sólo `INSERT` con `executeMany`. Omite `usr_crea` y `fec_crea`. Toda la respuesta se confirma con un único `COMMIT` y cualquier error provoca `ROLLBACK`.

Después del COMMIT del lote se llama una sola vez a `Z10.PKG_C01_DETRACCIONES.PRC_PROCESAR_TODO`. El package transfiere datos, limpia toda WORK y confirma su propia transacción. No se crea un trigger Oracle por fila.

Después se guarda el resultado final en `Z10.LOG_PROCESO_DETRACCIONES`, con una transacción independiente, antes de responder HTTP. Un resultado sin filas también se registra, sin llamar al package. No hay `MERGE` en la API ni se usa `SUNAT_SYNC_LOG`.

## Concurrencia y fallos

`SyncService` mantiene una única promesa activa por proceso y rechaza otra ejecución simultánea. El scheduler usa además `noOverlap` y espera la promesa. Esta exclusión no cubre múltiples procesos o servidores.

El reintento envuelve autenticación, consulta y carga a WORK, no el package ni la escritura del log. Con tres reintentos hay cuatro intentos máximos. Una confirmación de INSERT incierta tampoco se reintenta. Esto evita duplicar cargas ya confirmadas por un error de una etapa posterior.

`date` y la columna `DIA` indican fecha/hora real de ejecución en Lima; `queryDate` conserva el día consultado a medianoche. El log guarda `true`/`false`, trigger, contadores, duración y detalles tanto en éxito como en error.

## Interfaces

- `GET /api/health`: salud del proceso.
- `POST /api/sunat/id-cache`: diagnóstico de sesión.
- `POST /api/sunat/sync/today`: sincronización manual.
- `POST /api/sunat/sync/range`: intervalo inclusivo manual.
- `POST /api/sunat/detracciones/hoy`: alias del anterior.

Consulte [API](API.md), [configuración](CONFIGURATION.md), [base de datos](DATABASE.md) y [operación](OPERATIONS.md).
