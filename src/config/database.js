import oracledb from "oracledb";

import { env } from "./env.js";
import { logger } from "../infrastructure/logger.js";

let pool;

export async function initDatabase() {
  if (pool) return pool;

  pool = await oracledb.createPool({
    user: env.oracle.user,
    password: env.oracle.password,
    connectString: env.oracle.connectString,
    poolMin: env.oracle.poolMin,
    poolMax: env.oracle.poolMax,
    poolIncrement: env.oracle.poolIncrement
  });

  logger.info("oracle.pool.created", {
    poolMin: env.oracle.poolMin,
    poolMax: env.oracle.poolMax
  });
  return pool;
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
