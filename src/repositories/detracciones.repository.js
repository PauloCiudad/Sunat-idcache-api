import oracledb from "oracledb";

import { env } from "../config/env.js";
import { getConnection } from "../config/database.js";
import { logger } from "../infrastructure/logger.js";
import { mapDetraccion } from "./detracciones.mapper.js";

export const DETRACCIONES_PACKAGE_PROCEDURE =
  "Z10.PKG_C01_DETRACCIONES.PRC_PROCESAR_TODO";

function oracleErrorCode(error) {
  if (typeof error?.code === "string" && error.code.trim()) return error.code.trim();
  return String(error?.message || "").match(/\b(?:ORA-\d{5}|NJS-\d{3,5})\b/)?.[0] || null;
}

export function packageSuccessResult({ executed = true } = {}) {
  return {
    ok: true,
    executed,
    procedure: DETRACCIONES_PACKAGE_PROCEDURE,
    message: executed
      ? "El package terminó correctamente"
      : "El package no se ejecutó porque no hubo filas insertadas"
  };
}

export function packageFailureResult(error) {
  return {
    ok: false,
    executed: true,
    procedure: DETRACCIONES_PACKAGE_PROCEDURE,
    code: oracleErrorCode(error),
    errorNum: Number.isInteger(error?.errorNum) ? error.errorNum : null,
    offset: Number.isInteger(error?.offset) ? error.offset : null,
    message: error?.message || String(error)
  };
}

const COLUMNS = [
  "num_press", "cod_usuario_sol", "des_prov", "cod_tipcomprobante",
  "num_ruc_proveedor", "per_tributario", "fec_pago_desc", "num_npd",
  "des_adq", "num_constancia", "tip_bien", "tip_operacion", "num_doc_adq",
  "mto_deposito_desc", "num_cuenta", "mto_deposito", "num_comprobante",
  "fec_pago", "tip_doc_adq", "num_serie", "origen_desc", "cod_tipcta"
];

const STRING_SIZES = {
  cod_usuario_sol: 10,
  des_prov: 110,
  des_adq: 110,
  num_serie: 10,
  origen_desc: 30
};

function bindDefs() {
  return Object.fromEntries(COLUMNS.map(column => {
    if (column === "fec_pago_desc") return [column, { type: oracledb.DATE }];
    if (STRING_SIZES[column]) {
      return [column, { type: oracledb.STRING, maxSize: STRING_SIZES[column] }];
    }
    return [column, { type: oracledb.NUMBER }];
  }));
}

export class DetraccionesRepository {
  constructor({ connectionFactory = getConnection, schema = env.oracle.schema } = {}) {
    this.connectionFactory = connectionFactory;
    this.schema = schema;
  }

  async insertMany(records) {
    if (!records.length) return 0;

    const rows = records.map(mapDetraccion);

    for (const [index, row] of rows.entries()) {
      for (const [column, maxSize] of Object.entries(STRING_SIZES)) {
        if (row[column]?.length > maxSize) {
          throw new Error(
            `Registro ${index + 1}: ${column} excede VARCHAR2(${maxSize}); ` +
            `valor=${JSON.stringify(row[column])}`
          );
        }
      }
    }

    const binds = COLUMNS.map(column => `:${column}`).join(", ");
    const sql = `INSERT INTO ${this.schema}.W_DETRACCIONES_AUTO (` +
      `${COLUMNS.join(", ")}) VALUES (${binds})`;

    const connection = await this.connectionFactory();
    let committing = false;
    try {
      const result = await connection.executeMany(sql, rows, {
        bindDefs: bindDefs(),
        autoCommit: false
      });
      committing = true;
      await connection.commit();
      return result.rowsAffected || 0;
    } catch (error) {
      if (committing) {
        // Si se pierde la respuesta del COMMIT, no sabemos si Oracle confirmó el lote.
        error.retryable = false;
        error.commitUncertain = true;
      }
      await connection.rollback().catch(rollbackError => {
        error.retryable = false;
        logger.error("oracle.insert.rollback.failed", { message: rollbackError.message });
      });
      throw error;
    } finally {
      await this.#release(connection);
    }
  }

  async processAll() {
    const connection = await this.connectionFactory();
    try {
      // El package procesa el lote, limpia WORK y hace su propio COMMIT/ROLLBACK.
      // Esta llamada se realiza una sola vez y queda fuera del reintento de INSERT.
      await connection.execute(
        `BEGIN ${DETRACCIONES_PACKAGE_PROCEDURE}; END;`,
        {},
        { autoCommit: false }
      );
      return packageSuccessResult();
    } catch (error) {
      error.retryable = false;
      error.packageResult = packageFailureResult(error);
      await connection.rollback().catch(() => undefined);
      throw error;
    } finally {
      await this.#release(connection);
    }
  }

  async #release(connection) {
    await connection.close().catch(error => {
      logger.error("oracle.connection.close.failed", { message: error.message });
    });
  }
}
