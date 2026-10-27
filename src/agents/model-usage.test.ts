import assert from "node:assert/strict";
import test from "node:test";
import {
  isTransientModelError,
  recordFallback,
  recordModelUsed,
  runWithModelUsage,
  sanitizeReason,
} from "./model-usage.js";

test("classifies transient and non-transient model errors", () => {
  for (const status of [408, 429, 500, 503]) {
    assert.equal(isTransientModelError({ status }), true, String(status));
  }
  for (const status of [400, 401, 403, 404]) {
    assert.equal(isTransientModelError({ status }), false, String(status));
  }
  assert.equal(isTransientModelError({ code: "ETIMEDOUT" }), true);
  assert.equal(isTransientModelError(new Error("boom")), false);
  assert.equal(isTransientModelError({ cause: { status: 502 } }), true);
});

test("sanitizeReason never exposes provider messages", () => {
  assert.equal(sanitizeReason(Object.assign(new Error("sk-secret"), { status: 429 })), "HTTP 429");
  assert.equal(sanitizeReason(new Error("sk-secret")), "Error");
  assert.equal(sanitizeReason("x"), "model error");
});

test("model usage is scoped per run and ignored outside one", async () => {
  recordModelUsed("ignored");
  const { usage } = await runWithModelUsage(async () => {
    recordFallback({ from: "a", to: "b", reason: "HTTP 500" });
    recordModelUsed("b");
  });
  assert.equal(usage.modelUsed, "b");
  assert.equal(usage.fallbacks.length, 1);
});
