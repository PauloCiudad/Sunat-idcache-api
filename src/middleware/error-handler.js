import { env } from "../config/env.js";
import { formatDateTimePeru } from "../infrastructure/datetime.js";
import { logger } from "../infrastructure/logger.js";
import { SyncError } from "../sync/sync.error.js";

export function publicErrorResult(result, nodeEnv = env.nodeEnv) {
  const response = { ...result };
  if (nodeEnv !== "development") {
    delete response.detail;
    delete response.logDetail;
  }
  return response;
}

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
  res.status(error instanceof SyncError ? error.statusCode : (error.status || 502))
    .json(publicErrorResult(result));
}
