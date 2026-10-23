import assert from "node:assert/strict";
import test from "node:test";
import { containsSecret } from "./memory-safety.js";

test("detects common secret assignments and authorization tokens", () => {
  for (const input of [
    "password: example-value",
    "client_secret=not-a-real-secret",
    "Authorization: Bearer eyJhbGciOiJub25lIn0.payload.signature",
    "ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    "-----BEGIN PRIVATE KEY-----",
    "AKIAIOSFODNN7EXAMPLE",
  ]) {
    assert.equal(containsSecret(input), true, input);
  }
});

test("allows ordinary durable preferences and avoids returning secret matches", () => {
  assert.equal(containsSecret("The operator prefers email updates."), false);
  assert.equal(containsSecret("I prefer a dashboard with dark mode."), false);
});
