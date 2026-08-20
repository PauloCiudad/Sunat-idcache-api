import assert from "node:assert/strict";
import test from "node:test";

import { withRetry } from "../src/infrastructure/retry.js";

test("tres reintentos permiten cuatro intentos totales", async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts += 1;
    if (attempts < 4) throw new Error("temporal");
    return "ok";
  }, { retries: 3, baseDelayMs: 0 });

  assert.equal(result, "ok");
  assert.equal(attempts, 4);
});
