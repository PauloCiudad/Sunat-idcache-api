import { AuthService } from "./auth/auth.service.js";
import { createSunatController } from "./controllers/sunat.controller.js";
import { DetraccionesRepository } from "./repositories/detracciones.repository.js";
import { ProcessLogRepository } from "./repositories/process-log.repository.js";
import { SunatClient } from "./sunat/sunat.client.js";
import { SyncService } from "./sync/sync.service.js";

const authService = new AuthService();
const sunatClient = new SunatClient();
const repository = new DetraccionesRepository();
const logRepository = new ProcessLogRepository();
const syncService = new SyncService({ authService, sunatClient, repository, logRepository });
const controller = createSunatController({ authService, syncService });

export const container = {
  authService,
  sunatClient,
  repository,
  logRepository,
  syncService,
  controller
};
