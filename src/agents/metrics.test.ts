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

test("sums provider-reported input and output tokens per run and ignores repeated runs", () => {
  const counter = new ModelCallCounter();
  assert.equal(counter.promptTokens, undefined);
  assert.equal(counter.completionTokens, undefined);
  counter.handleLLMEnd({
    generations: [],
    llmOutput: { tokenUsage: { promptTokens: 10, completionTokens: 3 } },
  }, "a");
  counter.handleLLMEnd({
    generations: [],
    llmOutput: { tokenUsage: { promptTokens: 10, completionTokens: 3 } },
  }, "a");
  counter.handleLLMEnd({
    generations: [[{
      text: "",
      message: { usage_metadata: { input_tokens: 5, output_tokens: 2 } },
    } as never]],
  }, "b");
  assert.equal(counter.promptTokens, 15);
  assert.equal(counter.completionTokens, 5);
});

test("leaves token counts unavailable when usage is absent or malformed", () => {
  const counter = new ModelCallCounter();
  counter.handleLLMEnd({ generations: [] }, "a");
  counter.handleLLMEnd({
    generations: [],
    llmOutput: { tokenUsage: { promptTokens: "x", completionTokens: -1 } },
  }, "b");
  assert.equal(counter.promptTokens, undefined);
  assert.equal(counter.completionTokens, undefined);
});

test("sumPromptTokens is undefined only when nothing was reported", () => {
  assert.equal(sumPromptTokens(undefined, undefined), undefined);
  assert.equal(sumPromptTokens(3, undefined, 4), 7);
});
