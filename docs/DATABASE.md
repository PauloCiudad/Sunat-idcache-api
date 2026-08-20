# Base de datos y mapeo

## Tabla esperada

El esquema se toma de `ORACLE_SCHEMA`; la tabla se llama `W_DETRACCIONES_AUTO`.

```sql
CREATE TABLE z10.W_DETRACCIONES_AUTO (
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

No existe `MERGE`, búsqueda previa ni clave de idempotencia. Repetir una fecha puede insertar duplicados.

## Permisos mínimos

```sql
GRANT SELECT, INSERT ON z10.W_DETRACCIONES_AUTO TO nombre_usuario;
```

## Verificación

```powershell
npm run db:ping
npm run db:check
```

```sql
SELECT COUNT(*) AS total,
       MAX(fec_crea) AS ultima_insercion
FROM z10.W_DETRACCIONES_AUTO;

SELECT *
FROM z10.W_DETRACCIONES_AUTO
ORDER BY fec_crea DESC
FETCH FIRST 20 ROWS ONLY;
```

Confirme que su cliente SQL apunta al mismo host, servicio y esquema configurados en `.env`.

