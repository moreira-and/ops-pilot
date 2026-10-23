import assert from "node:assert/strict";
import test from "node:test";
import {
  createLearningService,
  LEARNING_EXTRACTION_PROMPT,
  type LearningExtractor,
} from "./learning-service.js";
import type { MemoryRecord } from "../memory/memory-types.js";

function memory(userId: string, fact: string): MemoryRecord {
  return {
    id: "memory-1",
    userId,
    fact,
    embedding: new Array(384).fill(0),
    createdAt: new Date("2026-10-23T00:00:00.000Z"),
  };
}

test("learning validates structured extraction and remembers only eligible facts", async () => {
  const calls: Array<{ userId: string; fact: string }> = [];
  const logs: string[] = [];
  const extractor: LearningExtractor = {
    async extract(message) {
      assert.equal(message, "I prefer incident updates by email.");
      return { hasLearning: true, fact: "The operator prefers email updates." };
    },
  };
  const service = createLearningService({
    extractor,
    logger: {
      info(message) { logs.push(message); },
      error: assert.fail,
    },
    async remember(userId, fact) {
      calls.push({ userId, fact });
      return memory(userId, fact);
    },
  });

  test("learning extraction prompt preserves the source language", () => {
    assert.match(LEARNING_EXTRACTION_PROMPT, /mesmo idioma da mensagem/i);
  });

  const result = await service.learn(
    "operator-1",
    "I prefer incident updates by email.",
  );

  assert.deepEqual(result, { status: "remembered", memory: memory("operator-1", "The operator prefers email updates.") });
  assert.deepEqual(calls, [{
    userId: "operator-1",
    fact: "The operator prefers email updates.",
  }]);
  assert.deepEqual(logs, ["Durable user memory learned."]);
  assert.doesNotMatch(JSON.stringify(logs), /email updates/i);
});

test("learning skips negative, blank, and invalid structured results", async () => {
  const outputs: unknown[] = [
    { hasLearning: false, fact: "" },
    { hasLearning: true, fact: " " },
    { hasLearning: "yes", fact: "invalid" },
  ];
  let remembered = 0;
  const service = createLearningService({
    extractor: { async extract() { return outputs.shift(); } },
    async remember() {
      remembered += 1;
      return memory("operator-1", "unexpected");
    },
  });

  assert.deepEqual(
    await service.learn("operator-1", "What's the status?"),
    { status: "skipped" },
  );
  await assert.rejects(
    service.learn("operator-1", "blank output"),
    /empty fact/,
  );
  await assert.rejects(
    service.learn("operator-1", "invalid output"),
    /hasLearning/,
  );
  assert.equal(remembered, 0);
});

test("learning skips secret-like source and extracted facts", async () => {
  let extracted = 0;
  let remembered = 0;
  const service = createLearningService({
    extractor: {
      async extract() {
        extracted += 1;
        return { hasLearning: true, fact: "Password: secret-value" };
      },
    },
    async remember() {
      remembered += 1;
      return memory("operator-1", "unsafe");
    },
  });

  assert.deepEqual(
    await service.learn("operator-1", "My password is source-secret."),
    { status: "skipped" },
  );
  assert.deepEqual(
    await service.learn("operator-1", "I prefer a quiet dashboard."),
    { status: "skipped" },
  );
  assert.equal(extracted, 1);
  assert.equal(remembered, 0);
});

test("learning propagates extraction and persistence failures", async () => {
  const failure = new Error("provider echoed user secret");
  const service = createLearningService({
    extractor: {
      async extract() { throw failure; },
    },
    async remember() {
      throw failure;
    },
  });

  await assert.rejects(service.learn("operator-1", "private user message"), failure);
});
