import { env } from "../config/env.js";
import { logger } from "../infrastructure/logger.js";
import { withRetry } from "../infrastructure/retry.js";

export function currentDatePeru(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.day}/${values.month}/${values.year}`;
}

export class SyncService {
  constructor({ authService, sunatClient, repository }) {
    this.authService = authService;
    this.sunatClient = sunatClient;
    this.repository = repository;
    this.running = null;
  }

  syncToday(trigger = "manual") {
    return this.syncDate(currentDatePeru(), trigger);
  }

  syncDate(date, trigger = "manual") {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
      return Promise.reject(new Error("La fecha debe tener formato DD/MM/YYYY"));
    }
    if (this.running) return this.running;
    this.running = this.#run(date, trigger).finally(() => { this.running = null; });
    return this.running;
  }

  async #run(date, trigger) {
    const startedAt = new Date();
    logger.info("sync.started", { trigger, date });

    try {
      const result = await withRetry(async attempt => {
        logger.info("sync.attempt.started", { trigger, date, attempt });
        const session = await this.authService.createSession();
        const { rows } = await this.sunatClient.getDetracciones({
          idCache: session.idCache,
          cookieHeader: session.cookieHeader,
          fechaInicio: date,
          fechaFin: date
        });
        const inserted = await this.repository.insertMany(rows);
        return { received: rows.length, inserted, attempt };
      }, {
        retries: env.sync.retries,
        onRetry: ({ attempt, nextAttempt, delayMs, error }) => {
          logger.warn("sync.retry", {
            attempt,
            nextAttempt,
            delayMs,
            message: error.message
          });
        }
      });

      const response = {
        ok: true,
        date,
        trigger,
        received: result.received,
        inserted: result.inserted,
        attempts: result.attempt,
        durationMs: Date.now() - startedAt.getTime()
      };
      logger.info("sync.completed", response);
      return response;
    } catch (error) {
      logger.error("sync.failed", {
        trigger,
        date,
        durationMs: Date.now() - startedAt.getTime(),
        message: error.message
      });
      throw error;
    }
  }
}
