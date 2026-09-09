import assert from "node:assert/strict";
import test from "node:test";
import {
  DetraccionesRepository, DETRACCIONES_PACKAGE_PROCEDURE
} from "../src/repositories/detracciones.repository.js";
import { mapProcessLog, ProcessLogRepository } from "../src/repositories/process-log.repository.js";

function connectionFixture(overrides = {}) {
  const calls = [];
  const connection = {
    executeMany: async (...args) => { calls.push(["executeMany", ...args]); return { rowsAffected: 1 }; },
    execute: async (...args) => { calls.push(["execute", ...args]); return {}; },
    commit: async () => { calls.push(["commit"]); },
    rollback: async () => { calls.push(["rollback"]); },
    close: async () => { calls.push(["close"]); },
    ...overrides
  };
  return { calls, connection, connectionFactory: async () => connection };
}

const sampleResult = {
  ok: true, date: "2026/09/04 05:00:12", queryDate: "2026/09/03 00:00:00",
  trigger: "scheduled", received: 32, inserted: 32, attempts: 1, durationMs: 11672
};

test("mantiene INSERT normal y su COMMIT antes de llamar al package", async () => {
  const { calls, connectionFactory } = connectionFixture();
  const repo = new DetraccionesRepository({ connectionFactory });
  assert.equal(await repo.insertMany([{ num_pres: 1 }]), 1);
  const packageResult = await repo.processAll();
  assert.deepEqual(calls.map(([event]) => event), ["executeMany", "commit", "close", "execute", "close"]);
  assert.match(calls[0][1], /^INSERT INTO .*W_DETRACCIONES_AUTO/);
  assert.ok(!calls[0][1].includes("usr_crea"));
  assert.ok(!calls[0][1].includes("fec_crea"));
  assert.equal(calls[0][3].autoCommit, false);
  assert.equal(calls[3][1], "BEGIN Z10.PKG_C01_DETRACCIONES.PRC_PROCESAR_TODO; END;");
  assert.equal(calls[3][3].autoCommit, false);
  assert.deepEqual(packageResult, {
    ok: true,
    executed: true,
    procedure: DETRACCIONES_PACKAGE_PROCEDURE,
    message: "El package terminó correctamente"
  });
});

test("fallo de INSERT revierte antes de liberar la conexión", async () => {
  const { calls, connectionFactory } = connectionFixture({
    executeMany: async () => { throw new Error("ORA-01438"); }
  });
  const repo = new DetraccionesRepository({ connectionFactory });
  await assert.rejects(repo.insertMany([{}]), /ORA-01438/);
  assert.deepEqual(calls.map(([event]) => event), ["rollback", "close"]);
});

test("COMMIT no confirmado se marca como no reintentable", async () => {
  const { connectionFactory } = connectionFixture({
    commit: async () => { throw new Error("Conexión cerrada"); }
  });
  const repo = new DetraccionesRepository({ connectionFactory });
  await assert.rejects(repo.insertMany([{}]), error => {
    assert.equal(error.retryable, false);
    assert.equal(error.commitUncertain, true);
    return true;
  });
});

test("fallo al cerrar tras COMMIT no hace fallar una carga confirmada", async () => {
  const { connectionFactory } = connectionFixture({
    close: async () => { throw new Error("Cierre fallido"); }
  });
  const repo = new DetraccionesRepository({ connectionFactory });
  assert.equal(await repo.insertMany([{}]), 1);
  await assert.doesNotReject(repo.processAll());
});

test("fallo del package conserva error original aunque falle rollback", async () => {
  const { connectionFactory } = connectionFixture({
    execute: async () => {
      throw Object.assign(new Error("ORA-20001: fallo package"), {
        code: "ORA-20001", errorNum: 20001, offset: 7
      });
    },
    rollback: async () => { throw new Error("fallo rollback"); }
  });
  const repo = new DetraccionesRepository({ connectionFactory });
  await assert.rejects(repo.processAll(), error => {
    assert.match(error.message, /fallo package/);
    assert.equal(error.retryable, false);
    assert.deepEqual(error.packageResult, {
      ok: false,
      executed: true,
      procedure: DETRACCIONES_PACKAGE_PROCEDURE,
      code: "ORA-20001",
      errorNum: 20001,
      offset: 7,
      message: "ORA-20001: fallo package"
    });
    return true;
  });
});

test("log guarda fecha y hora con TO_DATE explícito y un COMMIT independiente", async () => {
  const { connectionFactory, calls } = connectionFixture();
  await new ProcessLogRepository({ connectionFactory }).insert(sampleResult);
  assert.deepEqual(calls.map(([event]) => event), ["execute", "commit", "close"]);
  assert.match(calls[0][1], /INSERT INTO Z10.LOG_PROCESO_DETRACCIONES/);
  assert.match(calls[0][1], /TO_DATE\(:dia, 'YYYY\/MM\/DD HH24:MI:SS'\)/);
  assert.deepEqual(calls[0][2], {
    ok: "true", dia: "2026/09/04 05:00:12", tipo_registro: "scheduled",
    recibidos: 32, insertados: 32, intentos: 1, duracion: 11672,
    mensaje: "Proceso completado correctamente", detalle: "Fecha consultada: 2026/09/03 00:00:00"
  });
});

test("log de error conserva DIA y respeta límites VARCHAR2 con Unicode", () => {
  const row = mapProcessLog({ ...sampleResult, ok: false, inserted: null,
    message: "á".repeat(200), detail: "🙂".repeat(200) });
  assert.equal(row.ok, "false");
  assert.equal(row.dia, sampleResult.date);
  assert.equal(row.insertados, null);
  assert.equal(Buffer.byteLength(row.mensaje), 200);
  assert.equal(Buffer.byteLength(row.detalle), 300);
  assert.ok(!row.detalle.includes("\uFFFD"));
});

test("log de rango guarda inicio y fin en DETALLE", () => {
  const row = mapProcessLog({
    ...sampleResult,
    queryDate: undefined,
    queryStartDate: "2026/09/01 00:00:00",
    queryEndDate: "2026/09/04 00:00:00",
    trigger: "manual_range"
  });
  assert.equal(row.tipo_registro, "manual_range");
  assert.equal(row.detalle,
    "Rango consultado: 2026/09/01 00:00:00 - 2026/09/04 00:00:00");
});

test("fallo de log hace rollback y propaga el error", async () => {
  const { calls, connectionFactory } = connectionFixture({
    execute: async () => { throw new Error("ORA-00942"); }
  });
  await assert.rejects(new ProcessLogRepository({ connectionFactory }).insert(sampleResult), /ORA-00942/);
  assert.deepEqual(calls.map(([event]) => event), ["rollback", "close"]);
});

test("verificación de arranque admite una tabla de log visible sin hacer DML", async () => {
  const statements = [];
  const { connectionFactory, calls } = connectionFixture({ execute: async sql => {
    statements.push(sql);
    return { rows: [[9]] };
  } });
  await new ProcessLogRepository({ connectionFactory }).assertReady();
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^SELECT COUNT\(\*\) FROM ALL_TAB_COLUMNS/);
  assert.deepEqual(calls.map(([event]) => event), ["close"]);
});

test("tabla de log ausente impide arrancar antes de consultar SUNAT", async () => {
  const { connectionFactory, calls } = connectionFixture({ execute: async () => ({ rows: [[0]] }) });
  await assert.rejects(new ProcessLogRepository({ connectionFactory }).assertReady(), /001_log_proceso_detracciones.sql/);
  assert.deepEqual(calls.map(([event]) => event), ["close"]);
});
