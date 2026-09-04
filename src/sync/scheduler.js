import cron from "node-cron";

import { env } from "../config/env.js";
import { logger } from "../infrastructure/logger.js";

export function startScheduler(syncService, { scheduler = cron, config = env.sync } = {}) {
  const task = scheduler.schedule(config.cron, async () => {
    try {
      await syncService.syncPreviousDay("scheduled");
    } catch (error) {
      logger.error("scheduler.sync.failed", { message: error.message });
    }
  }, {
    timezone: config.timezone,
    noOverlap: true,
    name: "sunat-detracciones-daily"
  });

  logger.info("scheduler.started", {
    cron: config.cron,
    timezone: config.timezone
  });
  return task;
}
