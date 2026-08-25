import oracledb from "oracledb";

import { env } from "./env.js";
import { logger } from "../infrastructure/logger.js";

let pool;
let oracleClientInitialized = false;

function initOracleClient() {
  if (oracleClientInitialized) return;

  if (!env.oracle.thickMode) {
    logger.warn("oracle.client.thin", {
      message: "Thin mode no soporta Oracle Native Network Encryption"
    });
    oracleClientInitialized = true;
    return;
  }

  const options = {};
  if (env.oracle.clientLibDir) options.libDir = env.oracle.clientLibDir;
  if (env.oracle.clientConfigDir) {
    options.configDir = env.oracle.clientConfigDir;
  }

  try {
    oracledb.initOracleClient(options);
    oracleClientInitialized = true;
    logger.info("oracle.client.initialized", {
      mode: "thick",
      clientVersion: oracledb.oracleClientVersionString,
      libDirConfigured: Boolean(env.oracle.clientLibDir),
      configDirConfigured: Boolean(env.oracle.clientConfigDir)
    });
  } catch (error) {
    throw new Error(
      "No se pudo activar node-oracledb Thick mode. Instale Oracle Instant " +
      "Client de la misma arquitectura que Node.js y configure " +
      `ORACLE_CLIENT_LIB_DIR. Detalle: ${error.message}`,
      { cause: error }
    );
  }
}

export async function initDatabase() {
  if (pool) return pool;

  initOracleClient();

  try {
    pool = await oracledb.createPool({
      user: env.oracle.user,
      password: env.oracle.password,
      connectString: env.oracle.connectString,
      poolMin: env.oracle.poolMin,
      poolMax: env.oracle.poolMax,
      poolIncrement: env.oracle.poolIncrement
    });

    // Obliga a negociar una conexión al iniciar. createPool() puede ser lazy.
    const connection = await pool.getConnection();
    await connection.close();

    logger.info("oracle.pool.created", {
      mode: oracledb.thin ? "thin" : "thick",
      poolMin: env.oracle.poolMin,
      poolMax: env.oracle.poolMax
    });
    return pool;
  } catch (error) {
    if (pool) await pool.close(0).catch(() => undefined);
    pool = undefined;
    throw error;
  }
}

export async function getConnection() {
  const activePool = pool || await initDatabase();
  return activePool.getConnection();
}

export async function closeDatabase() {
  if (!pool) return;
  await pool.close(10);
  pool = undefined;
  logger.info("oracle.pool.closed");
}
