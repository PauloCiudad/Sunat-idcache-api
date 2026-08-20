# SUNAT Detracciones API

Servicio Node.js que inicia sesión en SUNAT con Clave SOL, obtiene el `idCache` de la sesión, consulta los pagos individuales de detracciones y los inserta en Oracle.

La sincronización se ejecuta automáticamente a las 02:00, hora de Lima, y también puede iniciarse mediante una API HTTP protegida con `x-api-key`.

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
```

El proceso consulta una sola fecha por ejecución. La tarea programada usa la fecha actual de `America/Lima`; la API permite indicar otra fecha para pruebas o recuperaciones manuales.

## Requisitos

- Node.js 20 o posterior.
- Acceso de red a gob.pe, SUNAT y Oracle.
- Credenciales SOL válidas.
- Un usuario Oracle con permiso de `INSERT` y `SELECT` sobre `Z10.W_DETRACCIONES_AUTO` (o el esquema configurado).
- Chromium de Playwright instalado.

## Instalación rápida

```powershell
npm install
npx playwright install chromium
Copy-Item .env.ejemplo .env
```

Complete `.env` con credenciales reales y valide Oracle:

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

Ejecutar la sincronización del día actual:

```powershell
$headers = @{ "x-api-key" = "SU_API_KEY" }
Invoke-RestMethod -Method Post `
  -Uri http://localhost:4000/api/sunat/sync/today `
  -Headers $headers `
  -ContentType "application/json" `
  -Body "{}"
```

Ejecutar una fecha específica:

```powershell
$body = @{ date = "19/08/2026" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri http://localhost:4000/api/sunat/sync/today `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

Respuesta correcta típica:

```json
{
  "ok": true,
  "date": "19/08/2026",
  "trigger": "manual",
  "received": 1,
  "inserted": 1,
  "attempts": 1,
  "durationMs": 8432
}
```

> Este proyecto sólo hace `INSERT`. No hace `MERGE`, actualización ni deduplicación. Repetir una fecha puede crear filas duplicadas.

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

