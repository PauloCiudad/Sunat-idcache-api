import { env } from "../config/env.js";
import { formatDateTimePeru } from "../infrastructure/datetime.js";
import { logger } from "../infrastructure/logger.js";
import { SyncError } from "../sync/sync.error.js";

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const startedAt = req.requestStartedAt || new Date();
  const result = error instanceof SyncError ? { ...error.result } : {
    ok: false,
    date: formatDateTimePeru(startedAt),
    trigger: req.method === "POST" ? "manual" : "http",
    durationMs: Math.max(0, Date.now() - startedAt.getTime()),
    message: "No se pudo completar la operación",
    detail: error.message
  };
  logger.error("http.request.failed", { method: req.method, path: req.path, ...result });
  if (env.nodeEnv !== "development") {
    delete result.detail;
    delete result.logDetail;
  }
  res.status(error instanceof SyncError ? error.statusCode : (error.status || 502)).json(result);
}
