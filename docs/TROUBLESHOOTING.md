# Solución de problemas

## La sincronización devuelve received: 0 e inserted: 0

No es un error Oracle: significa que SUNAT devolvió `resultado` vacío y el repositorio no recibió filas.

Revise, en este orden:

1. Ejecute la misma fecha manualmente con `{"date":"DD/MM/YYYY"}`.
2. Busque el evento `sunat.detracciones.received` y confirme `cod`, `msg` y `records`.
3. Verifique que la fecha tenga movimientos y que la cuenta corresponda a `tipoCuenta=1`.
4. Confirme que la respuesta pertenece al RUC autenticado.
5. Pruebe la consulta en SUNAT con la misma sesión.

La tarea de las 02:00 consulta el día anterior en Lima. Si devuelve cero, compruebe que SUNAT tenga movimientos para esa fecha y que la sesión corresponda al RUC esperado.

## SUNAT no respondió gestor-sesiones/recurso

El servicio espera un `GET` cuyo URL base sea:

```text
https://e-plataformaunica.sunat.gob.pe/v1/gestor-sesiones/recurso
```

Ignora el parámetro dinámico `_` y espera la respuesta que realmente contenga `idCache`.

Acciones:

- Use `HEADLESS=false` para observar la navegación.
- Revise `error-id-cache-*-pagina-*.png` generado al fallar.
- Confirme que el login no exige CAPTCHA, cambio de clave o aceptación adicional.
- Aumente temporalmente `SUNAT_TIMEOUT_MS` si la red es lenta.
- Compruebe proxy, firewall, TLS y acceso a gob.pe y SUNAT.

## La página queda en blanco o aparece ERR_CONNECTION_RESET

El flujo toma el enlace de “Iniciar trámite” en gob.pe y navega en la misma página. Hay reintentos internos para `ERR_CONNECTION_RESET`, `ERR_NETWORK_CHANGED` y `ERR_TIMED_OUT`.

Si persiste:

- pruebe desde el mismo servidor con un navegador normal;
- revise si un proxy corporativo bloquea el dominio;
- actualice Playwright y vuelva a instalar Chromium;
- mantenga `BROWSER_CHANNEL=chromium` salvo que el host requiera otro canal;
- compare el comportamiento con `HEADLESS=false`.

## Timeout esperando #txtRuc

SUNAT no llegó al formulario esperado. Normalmente la causa es una redirección incompleta, una pantalla intermedia o un cambio de selectores.

Abra las capturas de error y confirme si existen `#txtRuc`, `#btnPorRuc`, `#txtUsuario`, `#txtContrasena` y `#btnAceptar`. Si SUNAT cambió el HTML, debe actualizarse `src/auth/auth.service.js`.

## SUNAT devuelve cod distinto de 200

El cliente considera error cualquier payload con `cod` presente y distinto de 200. Revise `msg` en el error. Las causas habituales son `idCache` vencido, cookies incompletas, permisos de la cuenta o parámetros rechazados.

Cada reintento crea una sesión SOL nueva.

## Oracle conecta pero no aparecen filas

1. Compare `received` con `inserted`. Si ambos son cero, el problema está antes del repositorio.
2. Si `inserted` es mayor que cero, ejecute `npm run db:check`.
3. Compare `DB_NAME`, `SERVICE_NAME`, `SESSION_USER` y `CURRENT_SCHEMA` con su cliente SQL.
4. Consulte `ORACLE_SCHEMA.W_DETRACCIONES_AUTO`, no una tabla homónima de otro esquema.
5. Ordene por `fec_crea`, que Oracle completa con `SYSDATE`.

La aplicación hace `COMMIT` explícito después de `executeMany`.

## Errores ORA o NJS

- `ORA-01017`: usuario o contraseña incorrectos.
- `ORA-00942`: tabla inexistente para ese esquema o falta de privilegios.
- `ORA-12899`: texto más largo que la columna; el repositorio también valida longitudes conocidas.
- `ORA-01438`: número excede la precisión de la columna.
- `NJS-503` o errores de conexión: revise host, puerto, servicio, DNS y firewall.

Use `npm run db:ping` para separar problemas de conexión de problemas del flujo SUNAT.

## Se insertaron duplicados

Es una consecuencia posible del diseño solicitado: sólo `INSERT`, sin `MERGE` ni deduplicación. Antes de volver a ejecutar una fecha, revise las filas ya confirmadas. La limpieza o una restricción única deben definirse como una operación separada y controlada.
