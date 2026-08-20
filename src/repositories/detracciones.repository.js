import oracledb from "oracledb";

import { env } from "../config/env.js";
import { getConnection } from "../config/database.js";
import { mapDetraccion } from "./detracciones.mapper.js";

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
    const sql = `INSERT INTO ${env.oracle.schema}.W_DETRACCIONES_AUTO (` +
      `${COLUMNS.join(", ")}) VALUES (${binds})`;

    const connection = await getConnection();
    try {
      const result = await connection.executeMany(sql, rows, {
        bindDefs: bindDefs(),
        autoCommit: false
      });
      await connection.commit();
      return result.rowsAffected || 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.close();
    }
  }
}
