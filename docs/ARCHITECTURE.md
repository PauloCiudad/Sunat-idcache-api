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

Headers particulares: `Idcache`, `Idformulario: *MENU*`, `Cookie`, `Origin` y `Referer`.

Si `cod` está presente debe ser 200. `resultado` se trata como un arreglo; si no lo es, se considera vacío.

## Persistencia

El repositorio ejecuta sólo `INSERT` con `executeMany`. Omite `usr_crea` y `fec_crea`. Toda la respuesta se confirma con un único `COMMIT` y cualquier error provoca `ROLLBACK`.

No hay `MERGE`, deduplicación ni tabla `SUNAT_SYNC_LOG`.

## Concurrencia y fallos

`SyncService` mantiene una única promesa activa por proceso. El scheduler usa además `noOverlap`. Esta exclusión no cubre múltiples procesos o servidores.

El reintento envuelve el flujo completo. Con tres reintentos hay cuatro intentos máximos. Los eventos de cada etapa permiten reconstruir el resultado sin persistir un log funcional en Oracle.

## Interfaces

- `GET /api/health`: salud del proceso.
- `POST /api/sunat/id-cache`: diagnóstico de sesión.
- `POST /api/sunat/sync/today`: sincronización manual.
- `POST /api/sunat/detracciones/hoy`: alias del anterior.

Consulte [API](API.md), [configuración](CONFIGURATION.md), [base de datos](DATABASE.md) y [operación](OPERATIONS.md).
