import assert from "node:assert/strict";
import test from "node:test";
import { SyncService } from "../src/sync/sync.service.js";
import { SyncError } from "../src/sync/sync.error.js";

function fixture(overrides = {}) {
  const events = [];
  const logs = [];
  const queries = [];
  const service = new SyncService({
    now: () => new Date("2026-09-04T14:05:06Z"),
    retryOptions: { retries: 3, baseDelayMs: 0 },
    authService: { createSession: async () => {
      events.push("auth");
      return { idCache: "test", cookieHeader: "sid=test" };
    } },
    sunatClient: { getDetracciones: async input => {
      events.push("query");
      queries.push(input);
      return { rows: [{ num_pres: 1 }] };
    } },
    repository: {
      insertMany: async rows => { events.push("insert"); return rows.length; },
      processAll: async () => { events.push("package"); }
    },
    logRepository: { insert: async result => { events.push("log"); logs.push(result); } },
    ...overrides
  });
  return { service, events, logs, queries };
}

test("manual consulta hoy y guarda el log después del package", async () => {
  const { service, events, logs, queries } = fixture();
  const result = await service.syncToday();
  assert.deepEqual(events, ["auth", "query", "insert", "package", "log"]);
  assert.equal(queries[0].fechaInicio, "04/09/2026");
  assert.equal(queries[0].fechaFin, "04/09/2026");
  assert.deepEqual(result, {
    ok: true, date: "2026/09/04 09:05:06", queryDate: "2026/09/04 00:00:00",
    trigger: "manual", received: 1, inserted: 1, attempts: 1, durationMs: 0
  });
  assert.deepEqual(logs, [result]);
});

test("programada consulta ayer pero DIA corresponde al inicio real en Lima", async () => {
  const { service, logs, queries } = fixture();
  const result = await service.syncPreviousDay();
  assert.equal(result.trigger, "scheduled");
  assert.equal(result.date, "2026/09/04 09:05:06");
  assert.equal(result.queryDate, "2026/09/03 00:00:00");
  assert.equal(queries[0].fechaInicio, "03/09/2026");
  assert.equal(queries[0].fechaFin, "03/09/2026");
  assert.equal(logs.length, 1);
});

test("sin filas registra éxito sin ejecutar el package que limpia WORK", async () => {
  const { service, events, logs } = fixture({
    sunatClient: { getDetracciones: async () => ({ rows: [] }) }
  });
  const result = await service.syncToday();
  assert.equal(result.inserted, 0);
  assert.equal(result.received, 0);
  assert.ok(!events.includes("package"));
  assert.equal(logs.length, 1);
});

test("un error SUNAT conserva fecha, trigger, duración e intentos y se registra una vez", async () => {
  let tries = 0;
  const { service, logs } = fixture({
    authService: { createSession: async () => {
      tries += 1;
      throw new Error("SUNAT no respondió gestor-sesiones/recurso");
    } }
  });
  await assert.rejects(service.syncToday(), error => {
    assert.ok(error instanceof SyncError);
    assert.deepEqual(error.result, {
      ok: false, date: "2026/09/04 09:05:06", queryDate: "2026/09/04 00:00:00",
      trigger: "manual", received: 0, inserted: 0, attempts: 4, durationMs: 0,
      message: "No se pudo completar la operación",
      detail: "SUNAT no respondió gestor-sesiones/recurso"
    });
    assert.deepEqual(logs, [error.result]);
    return true;
  });
  assert.equal(tries, 4);
});

test("un reintento exitoso no duplica el package ni el log", async () => {
  let tries = 0;
  const { service, logs, events } = fixture({
    authService: { createSession: async () => {
      if (++tries === 1) throw new Error("temporal");
      return { idCache: "test" };
    } }
  });
  const result = await service.syncToday();
  assert.equal(result.attempts, 2);
  assert.equal(events.filter(x => x === "package").length, 1);
  assert.equal(logs.length, 1);
});

test("fallo del package no repite el INSERT ya confirmado", async () => {
  let inserts = 0;
  let packages = 0;
  const { service, logs } = fixture({ repository: {
    insertMany: async () => { inserts += 1; return 1; },
    processAll: async () => { packages += 1; throw new Error("ORA-20001: fallo de proceso"); }
  } });
  await assert.rejects(service.syncToday(), error => {
    assert.equal(error.result.inserted, 1);
    assert.equal(error.result.attempts, 1);
    assert.equal(error.result.needsManualReview, true);
    assert.match(error.result.detail, /ORA-20001/);
    return true;
  });
  assert.equal(inserts, 1);
  assert.equal(packages, 1);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].ok, false);
});

test("fallo del log tras éxito no reinicia carga ni package", async () => {
  let logs = 0;
  const { service, events } = fixture({
    logRepository: { insert: async () => { logs += 1; throw new Error("ORA-00942"); } }
  });
  await assert.rejects(service.syncToday(), error => {
    assert.equal(error.result.processed, true);
    assert.equal(error.result.logSaved, false);
    assert.equal(error.result.inserted, 1);
    assert.match(error.result.message, /No repita la carga/);
    return true;
  });
  assert.equal(events.filter(x => x === "insert").length, 1);
  assert.equal(events.filter(x => x === "package").length, 1);
  assert.equal(logs, 1);
});

test("fallo del log de error conserva la causa original", async () => {
  const { service } = fixture({
    authService: { createSession: async () => { throw new Error("SUNAT falló"); } },
    logRepository: { insert: async () => { throw new Error("Oracle no disponible"); } }
  });
  await assert.rejects(service.syncToday(), error => {
    assert.equal(error.result.detail, "SUNAT falló");
    assert.equal(error.result.logDetail, "Oracle no disponible");
    assert.equal(error.result.logSaved, false);
    assert.equal(error.result.attempts, 4);
    return true;
  });
});

test("resultado incierto de COMMIT no se reintenta ni se declara cero insertados", async () => {
  let inserts = 0;
  const { service, events } = fixture({ repository: {
    insertMany: async () => {
      inserts += 1;
      throw Object.assign(new Error("Conexión perdida al confirmar"), {
        retryable: false, commitUncertain: true
      });
    }
  } });
  await assert.rejects(service.syncToday(), error => {
    assert.equal(error.result.inserted, null);
    assert.equal(error.result.needsManualReview, true);
    assert.equal(error.result.attempts, 1);
    return true;
  });
  assert.equal(inserts, 1);
  assert.ok(!events.includes("package"));
});

test("manual rechaza fecha distinta a hoy y registra el rechazo sin cargar", async () => {
  const { service, events, logs } = fixture();
  await assert.rejects(service.syncToday("manual", "03/09/2026"), error => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.result.attempts, 0);
    assert.equal(error.result.date, "2026/09/04 09:05:06");
    return true;
  });
  assert.deepEqual(events, ["log"]);
  assert.equal(logs.length, 1);
});

test("rechaza una fecha calendario imposible", async () => {
  const { service, logs } = fixture();
  await assert.rejects(service.syncDate("31/02/2026"), error => error.statusCode === 400);
  assert.equal(logs[0].queryDate, undefined);
  assert.equal(logs[0].date, "2026/09/04 09:05:06");
});

test("rango consulta ambas fechas de forma inclusiva y procesa un solo lote", async () => {
  const { service, queries, events, logs } = fixture();
  const result = await service.syncRange("01/09/2026", "04/09/2026");
  assert.equal(queries[0].fechaInicio, "01/09/2026");
  assert.equal(queries[0].fechaFin, "04/09/2026");
  assert.equal(result.queryStartDate, "2026/09/01 00:00:00");
  assert.equal(result.queryEndDate, "2026/09/04 00:00:00");
  assert.equal(result.queryDate, undefined);
  assert.equal(result.trigger, "manual_range");
  assert.equal(events.filter(event => event === "package").length, 1);
  assert.equal(events.filter(event => event === "log").length, 1);
  assert.deepEqual(logs, [result]);
});

test("rango con inicio posterior al fin responde 400, registra y no consulta SUNAT", async () => {
  const { service, queries, logs } = fixture();
  await assert.rejects(service.syncRange("04/09/2026", "01/09/2026"), error => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.result.queryStartDate, "2026/09/04 00:00:00");
    assert.equal(error.result.queryEndDate, "2026/09/01 00:00:00");
    assert.equal(error.result.attempts, 0);
    return true;
  });
  assert.equal(queries.length, 0);
  assert.equal(logs.length, 1);
});

test("rango requiere startDate y endDate válidos", async () => {
  const { service, queries, logs } = fixture();
  await assert.rejects(service.syncRange(undefined, "04/09/2026"), error => {
    assert.equal(error.statusCode, 400);
    assert.match(error.result.message, /DD\/MM\/YYYY/);
    return true;
  });
  assert.equal(queries.length, 0);
  assert.equal(logs.length, 1);
});

test("manual concurrente no recibe el resultado de ayer del scheduler", async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const { service, logs } = fixture({ authService: {
    createSession: async () => { await wait; return { idCache: "test" }; }
  } });
  const scheduled = service.syncPreviousDay();
  await assert.rejects(service.syncToday(), error => {
    assert.equal(error.statusCode, 409);
    assert.equal(error.result.trigger, "manual");
    assert.equal(error.result.queryDate, "2026/09/04 00:00:00");
    return true;
  });
  release();
  const result = await scheduled;
  assert.equal(result.trigger, "scheduled");
  assert.equal(result.queryDate, "2026/09/03 00:00:00");
  assert.equal(logs.length, 2);
  assert.equal(service.running, null);
});

test("duración en milisegundos cubre carga y package", async () => {
  let time = Date.parse("2026-09-04T14:05:06Z");
  const { service, logs } = fixture({
    now: () => new Date(time),
    repository: {
      insertMany: async () => { time += 250; return 1; },
      processAll: async () => { time += 1750; }
    }
  });
  const result = await service.syncToday();
  assert.equal(result.durationMs, 2000);
  assert.equal(logs[0].durationMs, 2000);
  assert.equal(result.date, "2026/09/04 09:05:06");
});
