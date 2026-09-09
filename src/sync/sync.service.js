import { env } from "../config/env.js";
import { logger } from "../infrastructure/logger.js";
import { withRetry } from "../infrastructure/retry.js";
import {
  currentDatePeru, previousDatePeru, formatDateTimePeru, queryDateTime
} from "../infrastructure/datetime.js";
import {
  packageFailureResult, packageSuccessResult
} from "../repositories/detracciones.repository.js";
import { SyncError } from "./sync.error.js";

export { currentDatePeru, previousDatePeru } from "../infrastructure/datetime.js";

export class SyncService {
  constructor({ authService, sunatClient, repository, logRepository,
    now = () => new Date(), retryOptions = {} }) {
    this.authService = authService;
    this.sunatClient = sunatClient;
    this.repository = repository;
    this.logRepository = logRepository;
    this.now = now;
    this.retryOptions = retryOptions;
    this.running = null;
  }

  syncToday(trigger = "manual", requestedDate) {
    const startedAt = this.now();
    const date = currentDatePeru(startedAt);
    if (requestedDate !== undefined && requestedDate !== date) {
      return this.#reject(date, date, trigger, startedAt, 400,
        "Las ejecuciones manuales consultan hoy en Lima. Omita date o envíe la fecha de hoy en DD/MM/YYYY.");
    }
    return this.syncDate(date, trigger, startedAt);
  }

  syncPreviousDay(trigger = "scheduled") {
    const startedAt = this.now();
    return this.syncDate(previousDatePeru(startedAt), trigger, startedAt);
  }

  syncDate(date, trigger = "manual", startedAt = this.now()) {
    return this.syncRange(date, date, trigger, startedAt);
  }

  syncRange(startDate, endDate, trigger = "manual_range", startedAt = this.now()) {
    let startDateTime;
    let endDateTime;
    try {
      startDateTime = queryDateTime(startDate);
      endDateTime = queryDateTime(endDate);
    } catch (error) {
      return this.#reject(null, null, trigger, startedAt, 400, error.message);
    }
    if (startDateTime > endDateTime) {
      return this.#reject(startDate, endDate, trigger, startedAt, 400,
        "startDate no puede ser posterior a endDate");
    }
    if (this.running) {
      return this.#reject(startDate, endDate, trigger, startedAt, 409,
        "Ya existe una sincronización en curso. Espere a que termine antes de volver a solicitarla.");
    }
    this.running = this.#run(startDate, endDate, trigger, startedAt)
      .finally(() => { this.running = null; });
    return this.running;
  }

  #queryFields(startDate, endDate) {
    if (!startDate || !endDate) return {};
    if (startDate === endDate) return { queryDate: queryDateTime(startDate) };
    return {
      queryStartDate: queryDateTime(startDate),
      queryEndDate: queryDateTime(endDate)
    };
  }

  #result(startDate, endDate, trigger, startedAt, counters) {
    return {
      date: formatDateTimePeru(startedAt),
      ...this.#queryFields(startDate, endDate),
      trigger,
      ...counters,
      durationMs: Math.max(0, this.now().getTime() - startedAt.getTime())
    };
  }

  async #reject(startDate, endDate, trigger, startedAt, statusCode, message) {
    const result = await this.#saveLog({
      ok: false,
      ...this.#result(startDate, endDate, trigger, startedAt,
        { received: 0, inserted: 0, attempts: 0 }),
      message,
      detail: message
    });
    logger.error("sync.rejected", result);
    throw new SyncError(result, { statusCode });
  }

  async #run(startDate, endDate, trigger, startedAt) {
    const counters = { received: 0, inserted: 0, attempts: 0 };
    const context = {
      date: formatDateTimePeru(startedAt),
      ...this.#queryFields(startDate, endDate),
      trigger
    };
    logger.info("sync.started", context);
    let phase = "load";
    let result;
    let cause;
    let packageResult = packageSuccessResult({ executed: false });

    try {
      await withRetry(async attempt => {
        counters.attempts = attempt;
        counters.received = 0;
        counters.inserted = 0;
        logger.info("sync.attempt.started", { ...context, attempt });
        const session = await this.authService.createSession();
        const { rows } = await this.sunatClient.getDetracciones({
          idCache: session.idCache,
          cookieHeader: session.cookieHeader,
          fechaInicio: startDate,
          fechaFin: endDate
        });
        counters.received = rows.length;
        counters.inserted = await this.repository.insertMany(rows);
      }, {
        retries: env.sync.retries,
        ...this.retryOptions,
        shouldRetry: error => error.retryable !== false,
        onRetry: ({ attempt, nextAttempt, delayMs, error }) => {
          logger.warn("sync.retry", { ...context, attempt, nextAttempt, delayMs, message: error.message });
        }
      });

      phase = "process";
      if (counters.inserted > 0) {
        logger.info("sync.package.started", context);
        packageResult = await this.repository.processAll() || packageSuccessResult();
        logger.info("sync.package.completed", { ...context, package: packageResult });
      }
      result = {
        ok: true,
        ...this.#result(startDate, endDate, trigger, startedAt, counters),
        package: packageResult
      };
    } catch (error) {
      cause = error;
      if (error.commitUncertain) counters.inserted = null;
      result = {
        ok: false,
        ...this.#result(startDate, endDate, trigger, startedAt, counters),
        message: phase === "process"
          ? "El lote fue insertado, pero no se pudo confirmar el procesamiento del package"
          : "No se pudo completar la operación",
        detail: error.message
      };
      if (phase === "process") {
        result.package = error.packageResult || packageFailureResult(error);
      }
      if (phase === "process" || error.commitUncertain) {
        result.needsManualReview = true;
      }
    }

    // El log nunca vuelve a entrar en el reintento de autenticación/INSERT.
    result = await this.#saveLog(result);
    if (!result.ok) {
      logger.error("sync.failed", result);
      throw new SyncError(result, { cause });
    }
    logger.info("sync.completed", result);
    return result;
  }

  async #saveLog(result) {
    try {
      await this.logRepository.insert(result);
      return result;
    } catch (error) {
      logger.error("sync.log.failed", { ...result, logDetail: error.message });
      if (result.ok) {
        return {
          ...result,
          ok: false,
          processed: true,
          logSaved: false,
          needsManualReview: true,
          message: "Los datos se procesaron, pero no se pudo guardar el log en Oracle. No repita la carga.",
          detail: error.message
        };
      }
      return { ...result, logSaved: false, logDetail: error.message };
    }
  }
}
