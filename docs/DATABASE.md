# Base de datos y mapeo

## Tabla esperada

El esquema se toma de `ORACLE_SCHEMA`; la tabla se llama `W_DETRACCIONES_AUTO`.

```sql
CREATE TABLE {schema}.[TABLE] (
    num_press             NUMBER,
    cod_usuario_sol       VARCHAR2(10),
    des_prov              VARCHAR2(110),
    cod_tipcomprobante    NUMBER,
    num_ruc_proveedor     NUMBER,
    per_tributario        NUMBER,
    fec_pago_desc         DATE,
    num_npd               NUMBER,
    des_adq               VARCHAR2(110),
    num_constancia        NUMBER,
    tip_bien              NUMBER,
    tip_operacion         NUMBER,
    num_doc_adq           NUMBER,
    mto_deposito_desc     NUMBER(8,3),
    num_cuenta            NUMBER,
    mto_deposito          NUMBER(8,3),
    num_comprobante       NUMBER,
    fec_pago              NUMBER,
    tip_doc_adq           NUMBER,
    num_serie             VARCHAR2(10),
    origen_desc           VARCHAR2(30),
    cod_tipcta            NUMBER(1),
    usr_crea              VARCHAR2(30),
    fec_crea              DATE DEFAULT SYSDATE
) TABLESPACE C00;
```

La aplicación no incluye `usr_crea` ni `fec_crea` en el `INSERT`. `usr_crea` queda `NULL` y Oracle asigna `SYSDATE` a `fec_crea`.

## Mapeo SUNAT a Oracle

| Campo SUNAT | Columna Oracle | Conversión |
|---|---|---|
| `num_pres` | `num_press` | `NUMBER` |
| `cod_usuario_sol` | `cod_usuario_sol` | texto, máx. 10 |
| `des_prov` | `des_prov` | texto, máx. 110 |
| `cod_tipcomprobante` | `cod_tipcomprobante` | `NUMBER` |
| `num_ruc_proveedor` | `num_ruc_proveedor` | `NUMBER` |
| `per_tributario` | `per_tributario` | `NUMBER` |
| `fec_pago_desc` | `fec_pago_desc` | `DATE` |
| `num_npd` | `num_npd` | `NUMBER`; blanco se vuelve `NULL` |
| `des_adq` | `des_adq` | texto, máx. 110 |
| `num_constancia` | `num_constancia` | `NUMBER` |
| `tip_bien` | `tip_bien` | `NUMBER` |
| `tip_operacion` | `tip_operacion` | `NUMBER` |
| `num_doc_adq` | `num_doc_adq` | `NUMBER` |
| `mto_deposito_desc` | `mto_deposito_desc` | `NUMBER` |
| `num_cuenta` | `num_cuenta` | `NUMBER` |
| `mto_deposito` | `mto_deposito` | `NUMBER` |
| `num_comprobante` | `num_comprobante` | `NUMBER` |
| `fec_pago` | `fec_pago` | `NUMBER` (epoch de SUNAT) |
| `tip_doc_adq` | `tip_doc_adq` | `NUMBER` |
| `num_serie` | `num_serie` | texto, máx. 10 |
| `origen_desc` | `origen_desc` | texto, máx. 30 |
| `cod_tipcta` | `cod_tipcta` | `NUMBER` |

El mapper acepta nombres snake_case y camelCase. Valores vacíos pasan a `NULL`, cadenas numéricas a `Number` y fechas `YYYY-MM-DD` o `DD/MM/YYYY` a `Date`.

Al guardar identificadores en columnas `NUMBER`, sus ceros iniciales no se conservan. Es el comportamiento del DDL actual.

## Transacción

1. Se convierten y validan todos los registros.
2. Se ejecuta un lote con `executeMany` y `autoCommit: false`.
3. Si termina bien se hace `COMMIT`.
4. Ante un error se hace `ROLLBACK` y se propaga al mecanismo de reintento.

No existe `MERGE`, búsqueda previa ni clave de idempotencia en la carga a WORK. Repetir una fecha puede insertar duplicados en esa tabla.

## Procesamiento posterior

Tras confirmar un lote no vacío, la aplicación ejecuta una sola vez:

```sql
BEGIN
  Z10.PKG_C01_DETRACCIONES.PRC_PROCESAR_TODO;
END;
```

Este procedimiento llama a `PRC_CARGAR_DETRACCIONES` y `PRC_DETRACCIONES_MICHELL`. Transfiere datos a las tablas definitivas, limpia **toda** `Z10.W_DETRACCIONES_AUTO` y hace su propio COMMIT/ROLLBACK. La API no modifica ese package ni instala un trigger por fila.

`inserted` es la cantidad cargada a WORK antes de procesar, no el número de filas nuevas en las tablas finales. La lógica de filtrado de duplicados de las tablas finales pertenece al package. El proceso utiliza `Z10` explícitamente, por lo que `ORACLE_SCHEMA` debe coincidir.

Si el package falla, el INSERT previo ya está confirmado: no se recarga automáticamente. Revise el estado de las tablas y el error antes de reprocesar. Tampoco se reintenta un COMMIT de INSERT cuyo resultado sea incierto.

## Log de resultados

Antes de usar esta versión, cree la tabla con [001_log_proceso_detracciones.sql](../sql/001_log_proceso_detracciones.sql). Si ya existe, compruebe sus columnas; no vuelva a ejecutar CREATE TABLE. La API no crea ni reemplaza tablas.

| Columna | Valor |
|---|---|
| `OK` | `true` o `false`, como texto. |
| `DIA` | `date` de la respuesta: fecha/hora de inicio en Lima. |
| `TIPO_REGISTRO` | `manual` o `scheduled`. |
| `RECIBIDOS` | Registros de la última consulta SUNAT. |
| `INSERTADOS` | Filas confirmadas en WORK; NULL si se perdió la confirmación del COMMIT. |
| `INTENTOS` | Intentos de carga; 0 si la ejecución fue rechazada antes de iniciar. |
| `DURACION` | Milisegundos de carga/procesamiento, antes de escribir el log. |
| `MENSAJE` | Resultado general, hasta 200 bytes UTF-8. |
| `DETALLE` | Error técnico, fecha consultada o rango inicio-fin, hasta 300 bytes UTF-8. |

La conversión usa `TO_DATE(:dia, 'YYYY/MM/DD HH24:MI:SS')`: conserva fecha y hora sin depender de la zona horaria del servidor ni del NLS de la sesión. `DATE` no almacena un formato de presentación; para visualizarlo:

```sql
SELECT OK, TO_CHAR(DIA, 'YYYY/MM/DD HH24:MI:SS') AS DIA,
       TIPO_REGISTRO, RECIBIDOS, INSERTADOS, INTENTOS, DURACION, MENSAJE, DETALLE
FROM Z10.LOG_PROCESO_DETRACCIONES
ORDER BY DIA DESC;
```

Se guarda una fila final por ejecución, no una por reintento. La escritura del log es independiente del COMMIT del lote y del package. Si falla el log tras procesar, la API devuelve `processed:true`, `logSaved:false` y no repite los datos. Si Oracle está caído también puede fallar el registro del error: queda respaldo en consola.

Las fechas de los datos originales de SUNAT no cambian de tipo: `fec_pago_desc` sigue siendo DATE y `fec_pago` permanece NUMBER según el contrato existente. El formato legible aplica a las fechas de respuesta y de auditoría.

## Permisos mínimos

```sql
GRANT SELECT, INSERT ON {schema}.[TABLE] TO nombre_usuario;
GRANT INSERT ON Z10.LOG_PROCESO_DETRACCIONES TO nombre_usuario;
GRANT EXECUTE ON Z10.PKG_C01_DETRACCIONES TO nombre_usuario;
```

## Verificación

```powershell
npm run db:ping
npm run db:check
```

```sql
SELECT COUNT(*) AS total,
       TO_CHAR(MAX(fec_crea), 'YYYY/MM/DD HH24:MI:SS') AS ultima_insercion
FROM {schema}.[TABLE];

SELECT *
FROM {schema}.[TABLE]
ORDER BY fec_crea DESC
FETCH FIRST 20 ROWS ONLY;
```

Confirme que su cliente SQL apunta al mismo host, servicio y esquema configurados en `.env`.
