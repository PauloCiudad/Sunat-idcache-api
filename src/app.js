import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { container } from "./container.js";
import { requireApiKey } from "./middleware/api-key.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createSunatRoutes } from "./routes/sunat.routes.js";
import { formatDateTimePeru } from "./infrastructure/datetime.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use((req, res, next) => {
    req.requestStartedAt = new Date();
    next();
  });
  app.use(express.json());

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "sunat-detracciones-api", datePeru: formatDateTimePeru() });
  });

  app.use("/api/sunat", createSunatRoutes({
    controller: container.controller,
    limiter,
    requireApiKey
  }));

  app.use(errorHandler);

  return app;
}
