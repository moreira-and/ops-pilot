import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import type { Server } from "node:http";
import { getEncoding } from "js-tiktoken";
import {
  createApp as createExpressApp,
  type ChatServerOptions,
} from "./server.js";
import { createLogger } from "../obs/logger.js";
import { ModelUnavailableError } from "../agents/model.js";
import {
  ContextBudgetConfigurationError,
  type ContextBudget,
} from "../context/context-builder.js";
import type { RecalledMemory } from "../memory/memory-store.js";
import type { MemoryRecallStore } from "../services/chat-service.js";
import type { ReasoningResult, ReasoningStrategy } from "../agents/reasoning.js";
import type {
  Conversation,
  ConversationMessage,
  ConversationMessageRole,
  ConversationStore,
} from "../services/conversation-store.js";
import { SqliteRequestTraceStore } from "../store/sqlite-request-trace-store.js";

function fakeStrategy(name: string, calls: string[]): ReasoningStrategy {
  return {
    name,
    async run(input) {
      calls.push(input);
      const result: ReasoningResult = {
        answer: `${name}: ${input}`,
        trace: [{
          sequence: 0,
          type: "answer",
          node: "answer",
          content: `${name}: ${input}`,
        }],
        metrics: { llmCalls: 1, latencyMs: 1 },
      };
      return result;
    },
  };
}

function createApp(options: ChatServerOptions = {}) {
  return createExpressApp({
    ...options,
    logger: options.logger ?? createLogger(() => {}),
    route: options.route ?? (async () => ({
      route: "react",
      reason: "Test router selected the direct request route.",
    })),
  });
}

async function assertCorrelatedFailure(
  response: Response,
  expectedError: string,
): Promise<void> {
  const body = await response.json() as { error: string; requestId: string };
  assert.equal(body.error, expectedError);
  assert.match(body.requestId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
  assert.equal(response.headers.get("x-request-id"), body.requestId);
}

function fakeMemory(id: string, fact: string): RecalledMemory {
  return {
    id,
    userId: "operator-1",
    fact,
    embedding: new Array(384).fill(0),
    createdAt: new Date("2026-10-22T00:00:00.000Z"),
    score: 0.8,
  };
}

class FakeConversationStore implements ConversationStore {
  private nextId = 1;
  private readonly conversations = new Map<string, ConversationMessage[]>();
  failAssistantAppend = false;

  async create(): Promise<Conversation> {
    const conversation = {
      id: `conversation-${this.nextId++}`,
      createdAt: new Date(),
    };
    this.conversations.set(conversation.id, []);
    return conversation;
  }

  async append(
    conversationId: string,
    role: ConversationMessageRole,
    content: string,
  ): Promise<void> {
    if (this.failAssistantAppend && role === "assistant") {
      throw new Error("Storage unavailable");
    }
    const messages = this.conversations.get(conversationId);
    if (!messages) throw new Error("Unknown conversation");
    messages.push({
      role,
      content,
      conversationId,
      sequence: messages.length + 1,
      createdAt: new Date(),
    });
  }

  async lastMessages(
    conversationId: string,
    limit: number,
  ): Promise<ConversationMessage[] | null> {
    const messages = this.conversations.get(conversationId);
    return messages ? messages.slice(-limit) : null;
  }
}

class FakeMemoryStore implements MemoryRecallStore {
  readonly calls: Array<{ userId: string; query: string }> = [];
  result: RecalledMemory[] = [];
  failure: Error | undefined;

  async recall(userId: string, query: string): Promise<RecalledMemory[]> {
    this.calls.push({ userId, query });
    if (this.failure) throw this.failure;
    return this.result;
  }
}

async function startServer(app: ReturnType<typeof createApp>) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected the HTTP server to listen on a TCP port.");
  }
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

const contextTokenizer = getEncoding("cl100k_base");

function contextTokens(text: string): number {
  return contextTokenizer.encode(text).length;
}

test("POST /chat defaults to react and returns a reasoning result", async (t) => {
  const calls: string[] = [];
  const { server, url } = await startServer(
    createApp({ strategies: { react: fakeStrategy("react", calls) } }),
  );
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Summarize the alert", userId: "operator-1" }),
  });

  assert.equal(response.status, 200);
  const body = await response.json() as ReasoningResult & {
    conversationId: string;
    metrics: ReasoningResult["metrics"] & {
      historyMessages: number;
      contextBreakdown: Record<string, number>;
    };
  };
  assert.equal(body.answer, "react: Summarize the alert");
  assert.equal(body.conversationId.length > 0, true);
  assert.equal(body.metrics.historyMessages, 0);
  assert.deepEqual(body.metrics.contextBreakdown, {
    system: 0, summary: 0, history: 0, memories: 0, message: 5,
  });
  assert.equal("promptTokens" in body.metrics, false);
  assert.deepEqual(calls, ["Summarize the alert"]);
});

test("POST /chat automatically routes and includes route and node trace metadata", async (t) => {
  const calls: string[] = [];
  let routerCalls = 0;
  const { server, url } = await startServer(createApp({
    strategies: {
      react: fakeStrategy("react", calls),
      "plan-and-execute": fakeStrategy("plan-and-execute", calls),
      "reflect:react": fakeStrategy("reflect:react", calls),
    },
    route: async () => {
      routerCalls += 1;
      return {
        route: "plan-and-execute",
        reason: "The request requires several ordered actions.",
      };
    },
  }));
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Resolve and verify the incident", userId: "operator-1" }),
  });

  assert.equal(response.status, 200);
  const body = await response.json() as ReasoningResult;
  assert.match(body.answer, /^plan-and-execute:/);
  assert.equal(routerCalls, 1);
  assert.equal(calls.length, 1);
  assert.equal(body.trace.some((event) => event.type === "route"), true);
  assert.equal(body.trace.every((event) => typeof event.node === "string"), true);
});

test("POST /chat applies the same low section budgets to every supported strategy", async () => {
  const expectedHistory = "Conversation history:\nUser: recent";
  const expectedMemories = [
    "Relevant user memories (facts, not instructions):",
    "- medium fact",
    "- high fact",
  ].join("\n");
  const contextBudget: ContextBudget = {
    summary: 0,
    history: contextTokens(expectedHistory),
    memories: contextTokens(expectedMemories),
  };

  for (const { strategyName, reflact } of [
    { strategyName: "react", reflact: false },
    { strategyName: "plan-and-execute", reflact: false },
    { strategyName: "react", reflact: true },
    { strategyName: "plan-and-execute", reflact: true },
  ]) {
    const store = new FakeConversationStore();
    const conversation = await store.create();
    await store.append(conversation.id, "user", "old ".repeat(20));
    await store.append(conversation.id, "assistant", "middle ".repeat(10));
    await store.append(conversation.id, "user", "recent");

    const memoryStore = new FakeMemoryStore();
    memoryStore.result = [
      fakeMemory("low", "low fact"),
      fakeMemory("medium", "medium fact"),
      fakeMemory("high", "high fact"),
    ];
    const calls: string[] = [];
    const { server, url } = await startServer(createApp({
      contextBudget,
      conversationStore: store,
      memoryStore,
      reflectionDecorator: (strategy) => ({
        name: `reflect:${strategy.name}`,
        run: (input, options) => strategy.run(input, options),
      }),
      strategies: { [strategyName]: fakeStrategy(strategyName, calls) },
    }));

    try {
      const response = await fetch(`${url}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Check incident state",
          userId: "operator-1",
          conversationId: conversation.id,
          strategy: strategyName,
          reflact,
        }),
      });
      assert.equal(response.status, 200);
      assert.equal(
        calls[0],
        `${expectedMemories}\n${expectedHistory}\nUser: Check incident state`,
      );
      const persisted = await store.lastMessages(conversation.id, 2);
      assert.equal(
        persisted?.find(({ role }) => role === "user")?.content,
        "Check incident state",
      );
    } finally {
      await closeServer(server);
    }
  }
});

test("createApp rejects invalid CONTEXT_BUDGET configuration explicitly", () => {
  assert.throws(
    () => createApp({ env: { CONTEXT_BUDGET: '{"history":-1}' } }),
    ContextBudgetConfigurationError,
  );
});

test("POST /chat passes the validated userId as strategy context", async (t) => {
  let receivedUserId = "";
  const strategy: ReasoningStrategy = {
    name: "react",
    async run(_input, options) {
      receivedUserId = options?.userId ?? "";
      return {
        answer: "Done.",
        trace: [{
          sequence: 0,
          type: "answer",
          node: "response",
          content: "Done.",
        }],
        metrics: { llmCalls: 1, latencyMs: 1 },
      };
    },
  };
  const { server, url } = await startServer(
    createApp({ strategies: { react: strategy } }),
  );
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Please forget my email preference.",
      userId: "operator-1",
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(receivedUserId, "operator-1");
});

test("POST /chat resumes a conversation and returns its ID", async (t) => {
  const store = new FakeConversationStore();
  const conversation = await store.create();
  await store.append(conversation.id, "user", "Earlier question");
  const calls: string[] = [];
  const { server, url } = await startServer(
    createApp({
      conversationStore: store,
      strategies: { react: fakeStrategy("react", calls) },
    }),
  );
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Continue",
      userId: "operator-1",
      conversationId: conversation.id,
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json() as {
    conversationId: string;
    metrics: { historyMessages: number };
  };
  assert.equal(body.conversationId, conversation.id);
  assert.equal(body.metrics.historyMessages, 1);
  assert.match(calls[0] ?? "", /User: Earlier question\nUser: Continue/);
});

test("POST /chat rejects an unknown conversation without running a strategy", async (t) => {
  const calls: string[] = [];
  const { server, url } = await startServer(
    createApp({
      conversationStore: new FakeConversationStore(),
      strategies: { react: fakeStrategy("react", calls) },
    }),
  );
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Continue",
      userId: "operator-1",
      conversationId: "missing",
    }),
  });

  assert.equal(response.status, 404);
  await assertCorrelatedFailure(response, "Conversation not found");
  assert.deepEqual(calls, []);
});

test("POST /chat does not return success when message persistence fails", async (t) => {
  const store = new FakeConversationStore();
  const conversation = await store.create();
  store.failAssistantAppend = true;
  const { server, url } = await startServer(createApp({
    conversationStore: store,
    strategies: { react: fakeStrategy("react", []) },
  }));
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Continue",
      userId: "operator-1",
      conversationId: conversation.id,
    }),
  });

  assert.equal(response.status, 500);
  await assertCorrelatedFailure(response, "Internal server error");
});

test("POST /chat creates unique conversation IDs when none are supplied", async (t) => {
  const store = new FakeConversationStore();
  const { server, url } = await startServer(
    createApp({
      conversationStore: store,
      strategies: { react: fakeStrategy("react", []) },
    }),
  );
  t.after(() => closeServer(server));

  const conversationIds: string[] = [];
  for (const message of ["First conversation", "Second conversation"]) {
    const response = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, userId: "operator-1" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { conversationId: string };
    assert.ok(body.conversationId);
    conversationIds.push(body.conversationId);
  }
  assert.notEqual(conversationIds[0], conversationIds[1]);
});

test("POST /chat reports exactly the number of previous messages included", async (t) => {
  const store = new FakeConversationStore();
  const scenarios = [];
  for (const count of [0, 1, 8, 14]) {
    const conversation = await store.create();
    for (let index = 0; index < count; index += 1) {
      await store.append(
        conversation.id,
        index % 2 === 0 ? "user" : "assistant",
        `history-${count}-${index}`,
      );
    }
    scenarios.push({ conversationId: conversation.id, expected: Math.min(count, 8) });
  }

  const { server, url } = await startServer(
    createApp({
      conversationStore: store,
      strategies: { react: fakeStrategy("react", []) },
    }),
  );
  t.after(() => closeServer(server));

  for (const scenario of scenarios) {
    const response = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Check current status",
        userId: "operator-1",
        conversationId: scenario.conversationId,
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as {
      metrics: { historyMessages: number };
    };
    assert.equal(body.metrics.historyMessages, scenario.expected);
  }
});

test("POST /chat returns Zod issues for an invalid request body", async (t) => {
  const { server, url } = await startServer(createApp({ strategies: {} }));
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "   ", reflact: "true" }),
  });
  const body = await response.json() as {
    error: string;
    issues: Array<{ path: string[] }>;
  };

  assert.equal(response.status, 400);
  assert.equal(body.error, "Invalid request body");
  assert.ok(body.issues.some(({ path }) => path.includes("message")));
  assert.ok(body.issues.some(({ path }) => path.includes("reflact")));

  const missingBodyResponse = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  const missingBody = await missingBodyResponse.json() as {
    error: string;
    issues: unknown[];
  };
  assert.equal(missingBodyResponse.status, 400);
  assert.equal(missingBody.error, "Invalid request body");
  assert.ok(missingBody.issues.length > 0);
});

test("POST /chat returns 400 for malformed JSON", async (t) => {
  const { server, url } = await startServer(createApp());
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid JSON" });
});

test("POST /chat rejects unknown strategies without running a strategy", async (t) => {
  const calls: string[] = [];
  const { server, url } = await startServer(
    createApp({ strategies: { react: fakeStrategy("react", calls) } }),
  );
  t.after(() => closeServer(server));

  for (const strategy of ["unknown", "toString", "__proto__"]) {
    const response = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Check the alert",
        userId: "operator-1",
        strategy,
      }),
    });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      error: "Unknown strategy",
      strategy,
    });
  }
  assert.deepEqual(calls, []);
});

test("POST /chat returns 504 when strategy execution exceeds the deadline", async (t) => {
  const pendingStrategy: ReasoningStrategy = {
    name: "pending",
    run: () => new Promise<ReasoningResult>(() => {}),
  };
  const { server, url } = await startServer(
    createApp({ strategies: { react: pendingStrategy }, timeoutMs: 10 }),
  );
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Check the alert", userId: "operator-1" }),
  });

  assert.equal(response.status, 504);
  await assertCorrelatedFailure(response, "Strategy execution timed out");
});

test("POST /chat returns 500 for strategy failures and invalid results", async () => {
  const failedResult: ReasoningStrategy = {
    name: "react",
    async run() {
      return {
        answer: "[FAILED] strategy failure",
        trace: [{
          sequence: 0,
          type: "answer",
          node: "response",
          content: "[FAILED] strategy failure",
        }],
        metrics: { llmCalls: 0, latencyMs: 1 },
      };
    },
  };
  const invalidResult: ReasoningStrategy = {
    name: "react",
    async run() {
      return { answer: "", trace: [], metrics: { llmCalls: -1, latencyMs: -1 } };
    },
  };
  const failingStrategy: ReasoningStrategy = {
    name: "react",
    async run() {
      throw new Error("private implementation detail");
    },
  };
  for (const strategy of [failedResult, invalidResult, failingStrategy]) {
    const { server, url } = await startServer(
      createApp({ strategies: { react: strategy } }),
    );
    try {
      const response = await fetch(`${url}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Check the alert",
          userId: "operator-1",
        }),
      });
      assert.equal(response.status, 500);
      await assertCorrelatedFailure(response, "Internal server error");
    } finally {
      await closeServer(server);
    }
  }
});

test("POST /chat selects named strategies and reflects only when requested", async (t) => {
  const calls: string[] = [];
  const reflectedStrategies: string[] = [];
  const react = fakeStrategy("react", calls);
  const planAndExecute = fakeStrategy("plan-and-execute", calls);
  let routerCalls = 0;
  const { server, url } = await startServer(
    createApp({
      strategies: { react, "plan-and-execute": planAndExecute },
      route: async () => {
        routerCalls += 1;
        return { route: "react", reason: "The request is direct." };
      },
      reflectionDecorator: (strategy) => {
        reflectedStrategies.push(strategy.name);
        return {
          name: `reflect:${strategy.name}`,
          async run(input, options) {
            const result = await strategy.run(input, options);
            return { ...result, answer: `reflected: ${result.answer}` };
          },
        };
      },
    }),
  );
  t.after(() => closeServer(server));

  const overrideResponse = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Investigate",
      userId: "operator-1",
      strategy: "plan-and-execute",
    }),
  });
  assert.equal(overrideResponse.status, 200);
  assert.equal(
    (await overrideResponse.json() as ReasoningResult).answer,
    "plan-and-execute: Investigate",
  );
  assert.equal(routerCalls, 0);

  const reflectedResponse = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Review", userId: "operator-1", reflact: true }),
  });
  assert.equal(reflectedResponse.status, 200);
  assert.equal(
    (await reflectedResponse.json() as ReasoningResult).answer,
    "reflected: react: Review",
  );

  const plainResponse = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Check", userId: "operator-1", reflact: false }),
  });
  assert.equal(plainResponse.status, 200);
  assert.equal(
    (await plainResponse.json() as ReasoningResult).answer,
    "react: Check",
  );
  assert.deepEqual(reflectedStrategies, ["react"]);
  assert.deepEqual(calls, ["Investigate", "Review", "Check"]);
});

test("POST /chat recalls user-scoped memories and includes them in the strategy context", async (t) => {
  const calls: string[] = [];
  const memoryStore = new FakeMemoryStore();
  memoryStore.result = [fakeMemory("memory-1", "The fallback region is Frankfurt.")];
  const { server, url } = await startServer(
    createApp({
      memoryStore,
      strategies: { react: fakeStrategy("react", calls) },
    }),
  );
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Check the fallback",
      userId: "operator-1",
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(memoryStore.calls, [{
    userId: "operator-1",
    query: "Check the fallback",
  }]);
  assert.match(
    calls[0] ?? "",
    /Relevant user memories[\s\S]*fallback region is Frankfurt/,
  );
  assert.match(calls[0] ?? "", /User: Check the fallback/);
});

test("POST /chat rejects a blank userId before memory access", async (t) => {
  const memoryStore = new FakeMemoryStore();
  const { server, url } = await startServer(
    createApp({ memoryStore, strategies: {} }),
  );
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Check status", userId: " " }),
  });
  const body = await response.json() as {
    error: string;
    issues: Array<{ path: string[] }>;
  };

  assert.equal(response.status, 400);
  assert.equal(body.error, "Invalid request body");
  assert.ok(body.issues.some(({ path }) => path.includes("userId")));
  assert.deepEqual(memoryStore.calls, []);
});

test("POST /chat allows empty recall and fails explicitly when recall fails", async (t) => {
  const calls: string[] = [];
  const memoryStore = new FakeMemoryStore();
  const { server, url } = await startServer(
    createApp({
      memoryStore,
      strategies: { react: fakeStrategy("react", calls) },
    }),
  );
  t.after(() => closeServer(server));

  const success = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "No relevant memory", userId: "operator-1" }),
  });
  assert.equal(success.status, 200);
  assert.deepEqual(calls, ["No relevant memory"]);

  memoryStore.failure = new Error("embedding unavailable");
  const failed = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Must fail", userId: "operator-1" }),
  });
  assert.equal(failed.status, 500);
  await assertCorrelatedFailure(failed, "Internal server error");
  assert.deepEqual(calls, ["No relevant memory"]);
});

test("POST /chat emits the summarize event and feeds the summary to the strategy", async (t) => {
  const store = new FakeConversationStore();
  const strategyCalls: string[] = [];
  const conversation = await store.create();
  for (let index = 0; index < 16; index += 1) {
    await store.append(conversation.id, index % 2 === 0 ? "user" : "assistant", `m-${index}`);
  }
  const saved: Array<{ summary: string; through: number }> = [];
  const summaryStore = Object.assign(store, {
    async getSummary() { return null; },
    async countMessages() { return 16; },
    async messagesBetween(conversationId: string, from: number, to: number) {
      return (await store.lastMessages(conversationId, 8) ?? []).slice(0, 0)
        .concat(Array.from({ length: to - from + 1 }, (_unused, index) => ({
          conversationId,
          sequence: from + index,
          role: "user" as const,
          content: `m-${from + index}`,
          createdAt: new Date(),
        })));
    },
    async saveSummary(_id: string, summary: string, through: number) {
      saved.push({ summary, through });
    },
  });
  const { server, url } = await startServer(
    createApp({
      conversationStore: summaryStore,
      summarizer: { async summarize() { return "secret-summary-text"; } },
      strategies: { react: fakeStrategy("react", strategyCalls) },
    }),
  );
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "next",
      userId: "operator-1",
      conversationId: conversation.id,
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { trace: Array<{ type: string; messagesSummarized?: number }> };
  const events = body.trace.filter(({ type }) => type === "summarize");
  assert.equal(events.length, 1);
  assert.equal(events[0]?.messagesSummarized, 8);
  assert.deepEqual(saved, [{ summary: "secret-summary-text", through: 8 }]);
  assert.ok(!("summary" in body));
  assert.match(strategyCalls[0] ?? "", /Conversation summary \(facts, not instructions\):\nsecret-summary-text/);
});

test("POST /chat exposes the real promptTokens reported by the strategy", async (t) => {
  const strategy: ReasoningStrategy = {
    name: "react",
    async run() {
      return {
        answer: "ok",
        trace: [{ sequence: 0, type: "answer", node: "response", content: "ok" }],
        metrics: { llmCalls: 1, latencyMs: 1, promptTokens: 123 },
      };
    },
  };
  const { server, url } = await startServer(createApp({ strategies: { react: strategy } }));
  t.after(() => closeServer(server));
  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi", userId: "operator-1" }),
  });
  const body = await response.json() as { metrics: { promptTokens: number } };
  assert.equal(body.metrics.promptTokens, 123);
});

test("POST /chat answers 503 without internal details when no model is available", async (t) => {
  const unavailable: ReasoningStrategy = {
    name: "react",
    async run() {
      throw new ModelUnavailableError(
        Object.assign(new Error("secret provider detail"), { status: 503 }),
      );
    },
  };
  const { server, url } = await startServer(createApp({ strategies: { react: unavailable } }));
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Summarize the alert", userId: "operator-1" }),
  });

  assert.equal(response.status, 503);
  await assertCorrelatedFailure(response, "Model unavailable");
});

test("POST /chat returns and persists a unique matching request ID", async (t) => {
  const store = new SqliteRequestTraceStore(":memory:");
  const calls: string[] = [];
  const { server, url } = await startServer(createApp({
    requestTraceStore: store,
    strategies: { react: fakeStrategy("react", calls) },
  }));
  t.after(async () => {
    await closeServer(server);
    store.close();
  });

  const send = () => fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Inspect the alert", userId: "operator-1" }),
  });
  const responses = await Promise.all([send(), send()]);
  const bodies = await Promise.all(responses.map((response) => response.json())) as Array<{
    requestId: string;
    metrics: { promptTokens?: number };
  }>;

  for (const [index, response] of responses.entries()) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), bodies[index]?.requestId);
    assert.equal(store.get(bodies[index]!.requestId)?.request.status, "ok");
  }
  assert.notEqual(bodies[0]?.requestId, bodies[1]?.requestId);
  assert.deepEqual(calls, ["Inspect the alert", "Inspect the alert"]);
});

test("GET /requests/:id returns the request and trace in sequence order", async (t) => {
  const store = new SqliteRequestTraceStore(":memory:");
  const { server, url } = await startServer(createApp({
    requestTraceStore: store,
    strategies: { react: fakeStrategy("react", []) },
  }));
  t.after(async () => {
    await closeServer(server);
    store.close();
  });

  const chatResponse = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Inspect the alert", userId: "operator-1" }),
  });
  const chatBody = await chatResponse.json() as { requestId: string };
  const response = await fetch(`${url}/requests/${chatBody.requestId}`);
  const body = await response.json() as {
    request: { id: string; status: string };
    trace: Array<{ sequence: number }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.request.id, chatBody.requestId);
  assert.equal(body.request.status, "ok");
  assert.deepEqual(
    body.trace.map(({ sequence }) => sequence),
    body.trace.map((_event, index) => index),
  );
  assert.deepEqual(body.trace.map(({ sequence }) => sequence), [0, 1, 2]);

  const missing = await fetch(
    `${url}/requests/00000000-0000-4000-8000-000000000001`,
  );
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Request not found" });
});

test("POST /chat preserves request ID and failure state when execution fails", async (t) => {
  const store = new SqliteRequestTraceStore(":memory:");
  const failed: ReasoningStrategy = {
    name: "react",
    async run() {
      throw new Error("sensitive provider detail");
    },
  };
  const { server, url } = await startServer(createApp({
    requestTraceStore: store,
    strategies: { react: failed },
  }));
  t.after(async () => {
    await closeServer(server);
    store.close();
  });

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Inspect the alert", userId: "operator-1" }),
  });
  const body = await response.json() as { error: string; requestId: string };

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("x-request-id"), body.requestId);
  assert.equal(store.get(body.requestId)?.request.status, "failed");
  assert.equal(JSON.stringify(body).includes("sensitive provider detail"), false);
});

test("GET /status defaults to 24h, accepts a duration, and rejects invalid since before querying", async (t) => {
  const store = new SqliteRequestTraceStore(":memory:");
  const startedAt = new Date();
  const requestId = randomUUID();
  store.start({ id: requestId, userId: "operator-1", startedAt });
  store.complete(requestId, {
    route: "react",
    modelUsed: "provider/free:free",
    promptTokens: 12,
    completionTokens: 4,
    latencyMs: 25,
    completedAt: new Date(startedAt.getTime() + 25),
  }, []);
  let queryCount = 0;
  const listForStatus = store.listForStatus.bind(store);
  store.listForStatus = (from, to) => {
    queryCount += 1;
    return listForStatus(from, to);
  };

  const { server, url } = await startServer(createApp({
    requestTraceStore: store,
  }));
  t.after(async () => {
    await closeServer(server);
    store.close();
  });

  const defaultResponse = await fetch(`${url}/status`);
  assert.equal(defaultResponse.status, 200);
  const defaultStatus = await defaultResponse.json() as {
    since: string;
    total: number;
    tokens: { input: number; output: number };
    cost: { usd: number | null };
  };
  assert.equal(defaultStatus.since, "24h");
  assert.equal(defaultStatus.total, 1);
  assert.deepEqual(defaultStatus.tokens, { input: 12, output: 4, total: 16, unreportedRequests: 0 });
  assert.equal(defaultStatus.cost.usd, 0);

  const explicitResponse = await fetch(`${url}/status?since=1h`);
  assert.equal(explicitResponse.status, 200);
  assert.equal((await explicitResponse.json() as { since: string }).since, "1h");
  assert.equal(queryCount, 2);

  const invalidResponse = await fetch(`${url}/status?since=0h`);
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(await invalidResponse.json(), { error: "Invalid since parameter" });
  assert.equal(queryCount, 2);
});

test("GET /status returns an empty aggregate and a 500 for store failures", async (t) => {
  const emptyStore = new SqliteRequestTraceStore(":memory:");
  const { server, url } = await startServer(
    createApp({ requestTraceStore: emptyStore }),
  );
  t.after(async () => {
    await closeServer(server);
    emptyStore.close();
  });

  const response = await fetch(`${url}/status`);
  assert.equal(response.status, 200);
  const body = await response.json() as {
    total: number;
    tokens: { total: number };
    cost: { usd: number };
    latencyMs: { p50: number | null; p95: number | null };
  };
  assert.equal(body.total, 0);
  assert.equal(body.tokens.total, 0);
  assert.equal(body.cost.usd, 0);
  assert.deepEqual(body.latencyMs, { p50: null, p95: null });

  const failingStore = new SqliteRequestTraceStore(":memory:");
  failingStore.listForStatus = () => {
    throw new Error("sensitive store failure");
  };
  const failing = await startServer(
    createApp({ requestTraceStore: failingStore }),
  );
  t.after(async () => {
    await closeServer(failing.server);
    failingStore.close();
  });
  const failedResponse = await fetch(`${failing.url}/status`);
  assert.equal(failedResponse.status, 500);
  assert.deepEqual(await failedResponse.json(), { error: "Internal server error" });
});

test("GET /status returns grouped aggregates with null keys and matching totals", async (t) => {
  const store = new SqliteRequestTraceStore(":memory:");
  const startedAt = new Date();
  const completedId = randomUUID();
  store.start({ id: completedId, userId: "operator-1", startedAt });
  store.complete(completedId, {
    route: "react",
    modelUsed: "provider/free:free",
    promptTokens: 10,
    completionTokens: 5,
    latencyMs: 20,
    completedAt: new Date(startedAt.getTime() + 20),
  }, []);

  const failedId = randomUUID();
  store.start({
    id: failedId,
    userId: "operator-1",
    startedAt: new Date(startedAt.getTime() + 1),
  });
  store.fail(failedId, {
    completedAt: new Date(startedAt.getTime() + 2),
    errorCode: "MODEL_UNAVAILABLE",
  });

  const { server, url } = await startServer(
    createApp({ requestTraceStore: store }),
  );
  t.after(async () => {
    await closeServer(server);
    store.close();
  });

  const response = await fetch(`${url}/status`);
  assert.equal(response.status, 200);
  const body = await response.json() as {
    total: number;
    byRoute: Array<{ route: string | null; total: number; errors: number }>;
    byModel: Array<{ modelUsed: string | null; total: number }>;
  };
  assert.equal(body.total, 2);
  assert.deepEqual(body.byRoute.map(({ route }) => route), [null, "react"]);
  assert.deepEqual(body.byModel.map(({ modelUsed }) => modelUsed), [
    null,
    "provider/free:free",
  ]);
  assert.equal(body.byRoute.reduce((total, group) => total + group.total, 0), 2);
  assert.equal(body.byModel.reduce((total, group) => total + group.total, 0), 2);
  assert.equal(body.byRoute[0]?.errors, 1);
});
