import assert from "node:assert/strict";
import test from "node:test";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { RunnableLambda } from "@langchain/core/runnables";
import type { ChatOpenAI } from "@langchain/openai";
import {
  getModelConfig,
  ModelConfigurationError,
  ModelUnavailableError,
  ResilientChatModel,
} from "./model.js";
import { runWithModelUsage } from "./model-usage.js";

test("model configuration fails explicitly when required settings are missing", () => {
  assert.throws(
    () => getModelConfig({ OPENROUTER_API_KEY: "test-key" }),
    /OPENROUTES_MODEL/,
  );
  assert.throws(
    () => getModelConfig({ OPENROUTES_MODEL: "test/model" }),
    /OPENROUTER_API_KEY/,
  );
});

test("model configuration uses OpenRouter and deterministic temperature", () => {
  assert.deepEqual(
    getModelConfig({
      OPENROUTER_API_KEY: "test-key",
      OPENROUTES_MODEL: "test/model",
    }),
    {
      apiKey: "test-key",
      model: "test/model",
      baseURL: "https://openrouter.ai/api/v1",
      temperature: 0,
      maxAttempts: 2,
    },
  );
});

test("model configuration reads the optional fallback model", () => {
  const base = { OPENROUTER_API_KEY: "k", OPENROUTES_MODEL: "a/primary" };
  assert.equal(
    getModelConfig({ ...base, OPENROUTER_MODEL_FALLBACK: " b/backup " }).fallbackModel,
    "b/backup",
  );
  assert.equal(
    getModelConfig({ ...base, OPENROUTER_MODEL_FALLBACK: "  " }).fallbackModel,
    undefined,
  );
  assert.throws(
    () => getModelConfig({ ...base, OPENROUTER_MODEL_FALLBACK: "a/primary" }),
    ModelConfigurationError,
  );
});

function httpError(status: number): Error {
  return Object.assign(new Error("provider failure"), { status });
}

function fake(calls: { count: number }, behavior: (call: number) => string | Error) {
  return RunnableLambda.from(async () => {
    calls.count += 1;
    const result = behavior(calls.count);
    if (result instanceof Error) throw result;
    return new AIMessage(result);
  }) as unknown as ChatOpenAI;
}

function resilient(primary: ChatOpenAI, backup?: ChatOpenAI) {
  return new ResilientChatModel(
    primary,
    backup,
    { primary: "a/primary", fallback: backup ? "b/backup" : undefined },
    2,
  );
}

test("retries the primary model before answering", async () => {
  const calls = { count: 0 };
  const model = resilient(
    fake(calls, (call) => (call === 1 ? httpError(503) : "ok")),
  );
  const { value, usage } = await runWithModelUsage(() => model.invoke("hi"));
  assert.equal(value.content, "ok");
  assert.equal(calls.count, 2);
  assert.equal(usage.modelUsed, "a/primary");
  assert.deepEqual(usage.fallbacks, []);
});

test("falls back to the backup model when the primary keeps failing", async () => {
  const primary = { count: 0 };
  const backup = { count: 0 };
  const model = resilient(
    fake(primary, () => httpError(429)),
    fake(backup, () => "from backup"),
  );
  const { value, usage } = await runWithModelUsage(() => model.invoke("hi"));
  assert.equal(value.content, "from backup");
  assert.equal(primary.count, 2);
  assert.equal(usage.modelUsed, "b/backup");
  assert.deepEqual(usage.fallbacks, [
    { from: "a/primary", to: "b/backup", reason: "HTTP 429" },
  ]);
});

test("throws ModelUnavailableError when every model fails", async () => {
  const without = resilient(fake({ count: 0 }, () => httpError(503)));
  await assert.rejects(without.invoke("hi"), ModelUnavailableError);
  const both = resilient(
    fake({ count: 0 }, () => httpError(503)),
    fake({ count: 0 }, () => httpError(500)),
  );
  await assert.rejects(both.invoke("hi"), ModelUnavailableError);
});

test("does not retry or fall back on non-transient failures", async () => {
  const primary = { count: 0 };
  const backup = { count: 0 };
  const model = resilient(
    fake(primary, () => httpError(401)),
    fake(backup, () => "unused"),
  );
  await assert.rejects(
    model.invoke("hi"),
    (error: unknown) =>
      !(error instanceof ModelUnavailableError) &&
      (error as { status?: number }).status === 401,
  );
  assert.equal(primary.count, 1);
  assert.equal(backup.count, 0);
});

test("works as the llm of a ReAct agent through bindTools", async () => {
  const calls = { count: 0 };
  const runnable = fake(calls, (call) => (call === 1 ? httpError(503) : "agent ok"));
  const withTools = Object.assign(runnable, { bindTools: () => runnable });
  const agent = createReactAgent({ llm: resilient(withTools), tools: [] });
  const state = await agent.invoke({ messages: [new HumanMessage("hi")] });
  assert.equal(state.messages.at(-1)?.content, "agent ok");
  assert.equal(calls.count, 2);
});
