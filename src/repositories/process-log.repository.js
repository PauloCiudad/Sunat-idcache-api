import { getConnection } from "../config/database.js";
import { logger } from "../infrastructure/logger.js";

function truncateBytes(value, limit) {
  if (value === undefined || value === null || value === "") return null;
  let result = "";
  let bytes = 0;
  for (const char of String(value)) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > limit) break;
    result += char;
    bytes += size;
  }
  return result;
}

export function mapProcessLog(result) {
  const queryDetail = result.queryStartDate
    ? `Rango consultado: ${result.queryStartDate} - ${result.queryEndDate}`
    : result.queryDate
      ? `Fecha consultada: ${result.queryDate}`
      : null;
  return {
    ok: result.ok ? "true" : "false",
    dia: result.date,
    tipo_registro: truncateBytes(result.trigger, 30),
    recibidos: result.received,
    insertados: result.inserted,
    intentos: result.attempts,
    duracion: result.durationMs,
    mensaje: truncateBytes(result.message || "Proceso completado correctamente", 200),
    detalle: truncateBytes(result.detail || queryDetail, 300)
  };
}

export class ProcessLogRepository {
  constructor({ connectionFactory = getConnection } = {}) {
    this.connectionFactory = connectionFactory;
  }

  async assertReady() {
    const connection = await this.connectionFactory();
    try {
      // Sólo metadatos: no exige SELECT sobre el contenido ni genera un log ficticio.
      const result = await connection.execute(
        `SELECT COUNT(*) FROM ALL_TAB_COLUMNS
         WHERE OWNER = 'Z10' AND TABLE_NAME = 'LOG_PROCESO_DETRACCIONES'
           AND COLUMN_NAME IN ('OK', 'DIA', 'TIPO_REGISTRO', 'RECIBIDOS',
             'INSERTADOS', 'INTENTOS', 'DURACION', 'MENSAJE', 'DETALLE')`
      );
      if (Number(result.rows[0][0]) !== 9) {
        throw new Error(
          "Z10.LOG_PROCESO_DETRACCIONES no existe, no es visible o no tiene las columnas requeridas. " +
          "Ejecute sql/001_log_proceso_detracciones.sql como Z10/DBA y otorgue INSERT al usuario de la API."
        );
      }
    } finally {
      await connection.close().catch(error => {
        logger.error("oracle.log.connection.close.failed", { message: error.message });
      });
    }
  }

  async insert(result) {
    const connection = await this.connectionFactory();
    try {
      await connection.execute(
        `INSERT INTO Z10.LOG_PROCESO_DETRACCIONES (
          OK, DIA, TIPO_REGISTRO, RECIBIDOS, INSERTADOS, INTENTOS,
          DURACION, MENSAJE, DETALLE
        ) VALUES (
          :ok, TO_DATE(:dia, 'YYYY/MM/DD HH24:MI:SS'), :tipo_registro,
          :recibidos, :insertados, :intentos, :duracion, :mensaje, :detalle
        )`,
        mapProcessLog(result),
        { autoCommit: false }
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      throw error;
    } finally {
      // Una liberación fallida no debe aparentar que un COMMIT confirmado falló.
      await connection.close().catch(error => {
        logger.error("oracle.log.connection.close.failed", { message: error.message });
      });
    }
  }
}
