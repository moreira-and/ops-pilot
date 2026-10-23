import assert from "node:assert/strict";
import test from "node:test";
import { ModelCallCounter, startTimer, sumPromptTokens } from "./metrics.js";

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

test("sums provider-reported prompt tokens per run and ignores repeats of a run", () => {
  const counter = new ModelCallCounter();
  assert.equal(counter.promptTokens, undefined);
  counter.handleLLMEnd({ generations: [], llmOutput: { tokenUsage: { promptTokens: 10 } } }, "a");
  counter.handleLLMEnd({ generations: [], llmOutput: { tokenUsage: { promptTokens: 10 } } }, "a");
  counter.handleLLMEnd({
    generations: [[{ text: "", message: { usage_metadata: { input_tokens: 5 } } } as never]],
  }, "b");
  assert.equal(counter.promptTokens, 15);
});

test("leaves prompt tokens unavailable when usage is absent or malformed", () => {
  const counter = new ModelCallCounter();
  counter.handleLLMEnd({ generations: [] }, "a");
  counter.handleLLMEnd({ generations: [], llmOutput: { tokenUsage: { promptTokens: "x" } } }, "b");
  counter.handleLLMEnd({ generations: [], llmOutput: { tokenUsage: { promptTokens: -1 } } }, "c");
  assert.equal(counter.promptTokens, undefined);
});

test("sumPromptTokens is undefined only when nothing was reported", () => {
  assert.equal(sumPromptTokens(undefined, undefined), undefined);
  assert.equal(sumPromptTokens(3, undefined, 4), 7);
});
