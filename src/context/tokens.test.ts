import assert from "node:assert/strict";
import test from "node:test";
import { estimateBreakdown, estimateTokens } from "./tokens.js";

test("estimateTokens uses ceil(chars / 4)", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens("a"), 1);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
  assert.equal(estimateTokens("ação ação"), 3);
  assert.equal(estimateTokens("abcde"), estimateTokens("abcde"));
});

test("estimateBreakdown covers every source with 0 for absent ones", () => {
  assert.deepEqual(
    estimateBreakdown({ summary: "abcdefgh", message: "abcde", memories: null }),
    { system: 0, summary: 2, history: 0, memories: 0, message: 2 },
  );
});
