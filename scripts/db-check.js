import "dotenv/config";
import oracledb from "oracledb";

const { closeDatabase, getConnection } = await import("../src/config/database.js");
const { env, validateEnv } = await import("../src/config/env.js");

try {
  validateEnv();
  const connection = await getConnection();
  try {
    const session = await connection.execute(
      `SELECT
         SYS_CONTEXT('USERENV', 'DB_NAME') AS db_name,
         SYS_CONTEXT('USERENV', 'SERVICE_NAME') AS service_name,
         SYS_CONTEXT('USERENV', 'SESSION_USER') AS session_user,
         SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS current_schema
       FROM dual`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const counts = await connection.execute(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN TRUNC(fec_crea) = TRUNC(SYSDATE) THEN 1 END) AS today,
         MAX(fec_crea) AS last_created_at
       FROM ${env.oracle.schema}.W_DETRACCIONES_AUTO`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log("Sesión Oracle:", session.rows[0]);
    console.log("Tabla consultada:", `${env.oracle.schema}.W_DETRACCIONES_AUTO`);
    console.log("Conteos:", counts.rows[0]);
  } finally {
    await connection.close();
  }
} catch (error) {
  console.error("Falló la verificación Oracle:", error.message);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => undefined);
}
