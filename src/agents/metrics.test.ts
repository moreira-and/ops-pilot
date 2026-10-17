import assert from "node:assert/strict";
import test from "node:test";
import { ModelCallCounter, startTimer } from "./metrics.js";

test("counts each model run once and counts retry runs separately", () => {
  const counter = new ModelCallCounter();
  counter.recordInvocation("run-1");
  counter.recordInvocation("run-1");
  counter.recordInvocation("run-1-retry");
  assert.equal(counter.count, 2);
});

test("measures elapsed duration as a non-negative value", async () => {
  const elapsed = startTimer();
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.ok(elapsed() >= 0);
});
