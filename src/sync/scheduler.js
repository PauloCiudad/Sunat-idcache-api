import cron from "node-cron";

import { env } from "../config/env.js";
import { logger } from "../infrastructure/logger.js";

export function startScheduler(syncService) {
  const task = cron.schedule(env.sync.cron, () => {
    syncService.syncPreviousDay("scheduled").catch(error => {
      logger.error("scheduler.sync.failed", { message: error.message });
    });
  }, {
    timezone: env.sync.timezone,
    noOverlap: true,
    name: "sunat-detracciones-daily"
  });

  logger.info("scheduler.started", {
    cron: env.sync.cron,
    timezone: env.sync.timezone
  });
  return task;
}
