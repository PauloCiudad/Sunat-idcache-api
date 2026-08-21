import assert from "node:assert/strict";
import test from "node:test";

import {
  currentDatePeru,
  previousDatePeru,
  SyncService
} from "../src/sync/sync.service.js";

test("calcula la fecha usando America/Lima", () => {
  assert.equal(currentDatePeru(new Date("2026-08-20T04:30:00Z")), "19/08/2026");
});

test("calcula el día anterior usando la fecha calendario de Lima", () => {
  assert.equal(previousDatePeru(new Date("2026-08-21T15:30:00Z")), "20/08/2026");
  assert.equal(previousDatePeru(new Date("2026-01-01T15:30:00Z")), "31/12/2025");
  assert.equal(previousDatePeru(new Date("2026-08-21T04:30:00Z")), "19/08/2026");
});

test("coordina auth, consulta e insert", async () => {
  const calls = [];
  const service = new SyncService({
    authService: {
      createSession: async () => ({ idCache: "cache", cookieHeader: "sid=x" })
    },
    sunatClient: {
      getDetracciones: async input => {
        calls.push(input);
        return { rows: [{ numPres: 1 }, { numPres: 2 }] };
      }
    },
    repository: { insertMany: async rows => rows.length }
  });

  const result = await service.syncPreviousDay("test");
  assert.equal(result.received, 2);
  assert.equal(result.inserted, 2);
  assert.equal(result.attempts, 1);
  assert.equal(calls[0].idCache, "cache");
  assert.equal(calls[0].cookieHeader, "sid=x");
});

test("permite indicar fecha en una sincronización manual", async () => {
  let query;
  const service = new SyncService({
    authService: {
      createSession: async () => ({ idCache: "cache", cookieHeader: "sid=x" })
    },
    sunatClient: {
      getDetracciones: async input => {
        query = input;
        return { rows: [] };
      }
    },
    repository: { insertMany: async () => 0 }
  });

  await service.syncDate("19/08/2026", "test");
  assert.equal(query.fechaInicio, "19/08/2026");
  assert.equal(query.fechaFin, "19/08/2026");
});
