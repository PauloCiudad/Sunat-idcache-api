const integer = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  port: integer(process.env.PORT, 4000),
  apiKey: process.env.API_KEY,
  sunat: {
    tramiteUrl: process.env.SUNAT_TRAMITE_URL,
    ruc: process.env.SUNAT_RUC,
    usuarioSol: process.env.SUNAT_USUARIO_SOL,
    claveSol: process.env.SUNAT_CLAVE_SOL,
    headless: process.env.HEADLESS !== "false",
    browserChannel: process.env.BROWSER_CHANNEL || "chromium",
    requestTimeoutMs: integer(process.env.SUNAT_TIMEOUT_MS, 120_000)
  },
  oracle: {
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
    poolMin: integer(process.env.ORACLE_POOL_MIN, 1),
    poolMax: integer(process.env.ORACLE_POOL_MAX, 5),
    poolIncrement: integer(process.env.ORACLE_POOL_INCREMENT, 1),
    schema: process.env.ORACLE_SCHEMA || "Z10"
  },
  sync: {
    cron: process.env.SYNC_CRON || "0 2 * * *",
    timezone: process.env.SYNC_TIMEZONE || "America/Lima",
    retries: integer(process.env.SYNC_RETRIES, 3)
  }
});

export function validateEnv() {
  const required = {
    API_KEY: env.apiKey,
    SUNAT_TRAMITE_URL: env.sunat.tramiteUrl,
    SUNAT_RUC: env.sunat.ruc,
    SUNAT_USUARIO_SOL: env.sunat.usuarioSol,
    SUNAT_CLAVE_SOL: env.sunat.claveSol,
    ORACLE_USER: env.oracle.user,
    ORACLE_PASSWORD: env.oracle.password,
    ORACLE_CONNECT_STRING: env.oracle.connectString
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
  }

  if (!/^[A-Z][A-Z0-9_$#]*$/i.test(env.oracle.schema)) {
    throw new Error("ORACLE_SCHEMA contiene un identificador inválido");
  }
}
