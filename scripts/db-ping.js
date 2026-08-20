import "dotenv/config";

const { closeDatabase, getConnection } = await import("../src/config/database.js");
const { validateEnv } = await import("../src/config/env.js");

try {
  validateEnv();
  const connection = await getConnection();
  try {
    const result = await connection.execute(
      "SELECT 1 AS ok FROM dual",
      [],
      { outFormat: (await import("oracledb")).default.OUT_FORMAT_OBJECT }
    );
    console.log("Conexión Oracle correcta:", result.rows[0]);
  } finally {
    await connection.close();
  }
} catch (error) {
  console.error("Falló la conexión Oracle:", error.message);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => undefined);
}
