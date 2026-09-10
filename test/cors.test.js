import assert from "node:assert/strict";
import test from "node:test";

import { createCorsMiddleware } from "../src/middleware/cors.js";

function fixture({ origin, method = "GET" } = {}) {
  let nextCalled = false;
  const headers = new Map();
  const req = {
    method,
    get(name) {
      return name.toLowerCase() === "origin" ? origin : undefined;
    }
  };
  const res = {
    vary(value) { headers.set("vary", value); return this; },
    set(name, value) { headers.set(name.toLowerCase(), value); return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    sendStatus(value) { this.statusCode = value; return this; }
  };
  const next = () => { nextCalled = true; };
  return { req, res, next, headers, wasNextCalled: () => nextCalled };
}

test("CORS permite un origen configurado y expone x-api-key", () => {
  const origin = "http://localhost:5173";
  const context = fixture({ origin });
  createCorsMiddleware({ origins: [origin] })(context.req, context.res, context.next);

  assert.equal(context.wasNextCalled(), true);
  assert.equal(context.headers.get("access-control-allow-origin"), origin);
  assert.equal(context.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  assert.equal(context.headers.get("access-control-allow-headers"), "Content-Type, X-API-Key");
  assert.equal(context.headers.get("vary"), "Origin");
});

test("CORS resuelve el preflight antes de autenticacion", () => {
  const origin = "https://app.ejemplo.pe";
  const context = fixture({ origin, method: "OPTIONS" });
  createCorsMiddleware({ origins: [origin] })(context.req, context.res, context.next);

  assert.equal(context.res.statusCode, 204);
  assert.equal(context.wasNextCalled(), false);
  assert.equal(context.headers.get("access-control-max-age"), "86400");
});

test("CORS rechaza un origen no configurado", () => {
  const context = fixture({ origin: "https://malicioso.example" });
  createCorsMiddleware({ origins: ["https://app.ejemplo.pe"] })(
    context.req, context.res, context.next
  );

  assert.equal(context.res.statusCode, 403);
  assert.equal(context.res.body.ok, false);
  assert.equal(context.wasNextCalled(), false);
});

test("CORS no bloquea clientes que no envian Origin", () => {
  const context = fixture();
  createCorsMiddleware({ origins: [] })(context.req, context.res, context.next);
  assert.equal(context.wasNextCalled(), true);
});

test("CORS admite wildcard solo cuando se configura explicitamente", () => {
  const context = fixture({ origin: "https://cualquier.example" });
  createCorsMiddleware({ origins: ["*"] })(context.req, context.res, context.next);
  assert.equal(context.headers.get("access-control-allow-origin"), "*");
  assert.equal(context.wasNextCalled(), true);
});
