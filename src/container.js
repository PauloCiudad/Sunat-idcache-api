import { AuthService } from "./auth/auth.service.js";
import { createSunatController } from "./controllers/sunat.controller.js";
import { DetraccionesRepository } from "./repositories/detracciones.repository.js";
import { SunatClient } from "./sunat/sunat.client.js";
import { SyncService } from "./sync/sync.service.js";

const authService = new AuthService();
const sunatClient = new SunatClient();
const repository = new DetraccionesRepository();
const syncService = new SyncService({ authService, sunatClient, repository });
const controller = createSunatController({ authService, syncService });

export const container = {
  authService,
  sunatClient,
  repository,
  syncService,
  controller
};
