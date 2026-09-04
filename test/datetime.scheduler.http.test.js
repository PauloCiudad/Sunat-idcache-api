import assert from "node:assert/strict";
import test from "node:test";
import { formatDateTimePeru, previousDatePeru, queryDateTime } from "../src/infrastructure/datetime.js";
import { logger } from "../src/infrastructure/logger.js";
import { startScheduler } from "../src/sync/scheduler.js";
import { createSunatController } from "../src/controllers/sunat.controller.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { SyncError } from "../src/sync/sync.error.js";
import { withRetry } from "../src/infrastructure/retry.js";

function response() {
  return {
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("fecha y hora de Lima siempre usa 00-23 y no ISO/epoch", () => {
  assert.equal(formatDateTimePeru(new Date("2026-09-04T05:00:00Z")), "2026/09/04 00:00:00");
  assert.equal(formatDateTimePeru(new Date("2026-09-04T04:59:59Z")), "2026/09/03 23:59:59");
  assert.equal(formatDateTimePeru(new Date("2026-09-04T21:00:00Z")), "2026/09/04 16:00:00");
  assert.equal(previousDatePeru(new Date("2024-03-01T10:00:00Z")), "29/02/2024");
  assert.equal(queryDateTime("29/02/2024"), "2024/02/29 00:00:00");
  assert.throws(() => queryDateTime("29/02/2026"), /no es válida/);
});

test("logger emite loggedAt legible en lugar de timestamp UTC", t => {
  const messages = [];
  t.mock.method(console, "log", message => { messages.push(JSON.parse(message)); });
  logger.info("test.event");
  assert.match(messages[0].loggedAt, /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(Object.hasOwn(messages[0], "timestamp"), false);
});

test("scheduler registra 05:00/16:00 Lima y espera la promesa para noOverlap", async () => {
  let scheduled;
  let trigger;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const task = {};
  const syncService = { syncPreviousDay: async input => { trigger = input; await pending; } };
  const scheduler = { schedule: (...args) => { scheduled = args; return task; } };
  assert.equal(startScheduler(syncService, { scheduler }), task);
  const [cron, callback, options] = scheduled;
  assert.equal(cron, "0 5,16 * * *");
  assert.equal(options.timezone, "America/Lima");
  assert.equal(options.noOverlap, true);
  let finished = false;
  const run = callback().then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(trigger, "scheduled");
  assert.equal(finished, false);
  release();
  await run;
  assert.equal(finished, true);
});

test("controlador manual utiliza syncToday, no syncPreviousDay", async () => {
  let input;
  const result = { ok: true };
  const controller = createSunatController({ syncService: {
    syncToday: async (...args) => { input = args; return result; }
  } });
  const res = response();
  await controller.syncToday({ body: {} }, res, error => { throw error; });
  assert.deepEqual(input, ["manual", undefined]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, result);
});

test("controlador de rango entrega startDate y endDate al servicio", async () => {
  let input;
  const result = { ok: true };
  const controller = createSunatController({ syncService: {
    syncRange: async (...args) => { input = args; return result; }
  } });
  const res = response();
  await controller.syncRange({ body: {
    startDate: "01/09/2026", endDate: "04/09/2026"
  } }, res, error => { throw error; });
  assert.deepEqual(input, ["01/09/2026", "04/09/2026", "manual_range"]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, result);
});

test("error HTTP de sincronización conserva fecha, trigger y duración", () => {
  const result = {
    ok: false, date: "2026/09/04 10:22:03", queryDate: "2026/09/04 00:00:00",
    trigger: "manual", received: 0, inserted: 0, attempts: 4, durationMs: 12345,
    message: "No se pudo completar la operación", detail: "SUNAT no respondió gestor-sesiones/recurso"
  };
  const res = response();
  errorHandler(new SyncError(result), { method: "POST", path: "/api/sunat/sync/today" }, res, () => {});
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, result);
});

test("error HTTP genérico también incluye fecha hora de Lima y contexto", () => {
  const res = response();
  errorHandler(new Error("fallo"), {
    method: "POST", path: "/api/sunat/id-cache",
    requestStartedAt: new Date("2026-09-04T15:22:03Z")
  }, res, () => {});
  assert.equal(res.body.date, "2026/09/04 10:22:03");
  assert.equal(res.body.trigger, "manual");
  assert.equal(typeof res.body.durationMs, "number");
});

test("retry respeta operaciones marcadas como no reintentables", async () => {
  let attempts = 0;
  await assert.rejects(withRetry(async () => {
    attempts += 1;
    throw Object.assign(new Error("no repetir"), { retryable: false });
  }, { retries: 3, baseDelayMs: 0, shouldRetry: error => error.retryable !== false }), /no repetir/);
  assert.equal(attempts, 1);
});
