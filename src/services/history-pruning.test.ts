import assert from "node:assert/strict";
import test from "node:test";
import { planPruning } from "./history-pruning.js";

test("planPruning waits for 8 expired messages beyond the summarized point", () => {
  assert.equal(planPruning({ totalMessages: 8, summarizedThrough: 0 }), null);
  assert.equal(planPruning({ totalMessages: 15, summarizedThrough: 0 }), null);
  assert.deepEqual(planPruning({ totalMessages: 16, summarizedThrough: 0 }), {
    fromSequence: 1,
    toSequence: 8,
  });
  assert.equal(planPruning({ totalMessages: 23, summarizedThrough: 8 }), null);
  assert.deepEqual(planPruning({ totalMessages: 24, summarizedThrough: 8 }), {
    fromSequence: 9,
    toSequence: 16,
  });
  assert.deepEqual(planPruning({ totalMessages: 40, summarizedThrough: 8 }), {
    fromSequence: 9,
    toSequence: 32,
  });
});
