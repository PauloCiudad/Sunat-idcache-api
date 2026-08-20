import "dotenv/config";

const { createApp } = await import("./app.js");
const { closeDatabase, initDatabase } = await import("./config/database.js");
const { env, validateEnv } = await import("./config/env.js");
const { container } = await import("./container.js");
const { closeBrowser } = await import("./infrastructure/browser.js");
const { logger } = await import("./infrastructure/logger.js");
const { startScheduler } = await import("./sync/scheduler.js");

validateEnv();
await initDatabase();

const app = createApp();
const server = app.listen(env.port, "0.0.0.0", () => {
  logger.info("server.started", { port: env.port });
});
const scheduledTask = startScheduler(container.syncService);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("server.shutdown.started", { signal });
  scheduledTask.stop();
  server.close();
  await Promise.allSettled([closeBrowser(), closeDatabase()]);
  logger.info("server.shutdown.completed", { signal });
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", reason => {
  logger.error("process.unhandledRejection", {
    message: reason instanceof Error ? reason.message : String(reason)
  });
});
