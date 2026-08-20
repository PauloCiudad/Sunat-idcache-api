import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { env } from "./config/env.js";
import { container } from "./container.js";
import { logger } from "./infrastructure/logger.js";
import { requireApiKey } from "./middleware/api-key.js";
import { createSunatRoutes } from "./routes/sunat.routes.js";
import { currentDatePeru } from "./sync/sync.service.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json());

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "sunat-detracciones-api", datePeru: currentDatePeru() });
  });

  app.use("/api/sunat", createSunatRoutes({
    controller: container.controller,
    limiter,
    requireApiKey
  }));

  app.use((error, req, res, next) => {
    logger.error("http.request.failed", {
      method: req.method,
      path: req.path,
      message: error.message
    });
    res.status(502).json({
      ok: false,
      message: "No se pudo completar la operación",
      detail: env.nodeEnv === "development" ? error.message : undefined
    });
  });

  return app;
}
