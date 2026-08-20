import { Router } from "express";

export function createSunatRoutes({ controller, limiter, requireApiKey }) {
  const router = Router();
  router.use(requireApiKey, limiter);
  router.post("/id-cache", controller.getIdCache);
  router.post("/sync/today", controller.syncToday);
  router.post("/detracciones/hoy", controller.syncToday);
  return router;
}
