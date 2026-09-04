# Configuración

La aplicación carga `.env` al iniciar. Copie `.env.ejemplo`, complete sus valores y no lo incluya en el control de versiones.

## Variables

| Variable | Obligatoria | Predeterminado | Descripción |
|---|---:|---|---|
| `NODE_ENV` | No | `development` | Use `production` para ocultar detalles técnicos HTTP. |
| `PORT` | No | `4000` | Puerto de la API. |
| `API_KEY` | Sí | — | Protege todos los endpoints POST. |
| `SUNAT_TRAMITE_URL` | Sí | — | Página de gob.pe cuyo enlace inicia el trámite SOL. |
| `SUNAT_RUC` | Sí | — | RUC usado en el login. |
| `SUNAT_USUARIO_SOL` | Sí | — | Usuario secundario SOL. |
| `SUNAT_CLAVE_SOL` | Sí | — | Contraseña SOL. |
| `HEADLESS` | No | `true` | Sólo `false` muestra el navegador. |
| `BROWSER_CHANNEL` | No | `chromium` | Canal usado por Playwright. |
| `SUNAT_TIMEOUT_MS` | No | `120000` | Timeout del navegador y requests SUNAT. |
| `ORACLE_USER` | Sí | — | Usuario Oracle. |
| `ORACLE_PASSWORD` | Sí | — | Contraseña Oracle. |
| `ORACLE_CONNECT_STRING` | Sí | — | Ejemplo: `host:1521/servicio`. |
| `ORACLE_SCHEMA` | No | `Z10` | Propietario de WORK. Debe ser `Z10` para el package integrado. |
| `ORACLE_THICK_MODE` | No | `true` | Activa Thick mode, necesario para Native Network Encryption. |
| `ORACLE_CLIENT_LIB_DIR` | Windows | — | Carpeta del Instant Client que contiene `oci.dll`. |
| `ORACLE_CLIENT_CONFIG_DIR` | No | — | Carpeta opcional con `sqlnet.ora` o `tnsnames.ora`. |
| `ORACLE_POOL_MIN` | No | `1` | Conexiones mínimas del pool. |
| `ORACLE_POOL_MAX` | No | `5` | Conexiones máximas del pool. |
| `ORACLE_POOL_INCREMENT` | No | `1` | Incremento del pool. |
| `SYNC_CRON` | No | `0 5,16 * * *` | Ejecuciones a las 05:00 y 16:00. |
| `SYNC_TIMEZONE` | No | `America/Lima` | Zona horaria del scheduler; la consulta predeterminada usa el día anterior. |
| `SYNC_RETRIES` | No | `3` | Reintentos de carga; de 0 a 8 para respetar `INTENTOS NUMBER(1)`. |

`SYNC_RETRIES=3` permite hasta 4 intentos totales. Cada reintento vuelve a autenticar, consulta SUNAT e intenta insertar. El package y el log están fuera de este reintento, al igual que un COMMIT cuyo resultado no se pudo confirmar.

## Ejemplo

```env
NODE_ENV=production
PORT=4000
API_KEY=cambie-este-valor

SUNAT_TRAMITE_URL=https://www.gob.pe/1144-declaracion-y-pago-de-impuestos-a-sunat-personas-naturales-declarar-y-pagar-rentas-de-cuarta-categoria
SUNAT_RUC=20123456789
SUNAT_USUARIO_SOL=USUARIO
SUNAT_CLAVE_SOL=clave-secreta
HEADLESS=true
BROWSER_CHANNEL=chromium
SUNAT_TIMEOUT_MS=120000

ORACLE_USER=usuario
ORACLE_PASSWORD=clave
ORACLE_CONNECT_STRING=host:1521/servicio
ORACLE_SCHEMA=Z10
ORACLE_THICK_MODE=true
ORACLE_CLIENT_LIB_DIR=C:\oracle\instantclient_19_28
ORACLE_POOL_MIN=1
ORACLE_POOL_MAX=5
ORACLE_POOL_INCREMENT=1

SYNC_CRON=0 5,16 * * *
SYNC_TIMEZONE=America/Lima
SYNC_RETRIES=3
```

## Validación al arrancar

El servidor no inicia si falta una variable obligatoria, si el esquema no es Z10, si no puede crear el pool Oracle o si no son visibles las columnas de `Z10.LOG_PROCESO_DETRACCIONES`. Así se evita dejar una API activa pero incapaz de registrar sus ejecuciones.
