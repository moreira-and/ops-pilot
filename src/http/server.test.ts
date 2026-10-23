import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { Server } from "node:http";
import { createApp } from "./server.js";
import type { RecalledMemory } from "../memory/memory-store.js";
import type { MemoryRecallStore } from "../services/chat-service.js";
import type { ReasoningResult, ReasoningStrategy } from "../agents/reasoning.js";
import type {
  Conversation,
  ConversationMessage,
  ConversationMessageRole,
  ConversationStore,
} from "../services/conversation-store.js";

function fakeStrategy(name: string, calls: string[]): ReasoningStrategy {
  return {
    name,
    async run(input) {
      calls.push(input);
      const result: ReasoningResult = {
        answer: `${name}: ${input}`,
        trace: [{ sequence: 0, type: "answer", content: `${name}: ${input}` }],
        metrics: { llmCalls: 1, latencyMs: 1 },
      };
      return result;
    },
  };
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
    metrics: ReasoningResult["metrics"] & { historyMessages: number };
  };
  assert.equal(body.answer, "react: Summarize the alert");
  assert.equal(body.conversationId.length > 0, true);
  assert.equal(body.metrics.historyMessages, 0);
  assert.deepEqual(calls, ["Summarize the alert"]);
});

test("POST /chat passes the validated userId as strategy context", async (t) => {
  let receivedUserId = "";
  const strategy: ReasoningStrategy = {
    name: "react",
    async run(_input, options) {
      receivedUserId = options?.userId ?? "";
      return {
        answer: "Done.",
        trace: [{ sequence: 0, type: "answer", content: "Done." }],
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
  assert.deepEqual(await response.json(), { error: "Conversation not found" });
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
  assert.deepEqual(await response.json(), { error: "Internal server error" });
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
  assert.deepEqual(await response.json(), {
    error: "Strategy execution timed out",
  });
});

test("POST /chat returns 500 for strategy failures and invalid results", async (t) => {
  const failedResult: ReasoningStrategy = {
    name: "failed",
    async run() {
      return {
        answer: "[FAILED] strategy failure",
        trace: [{ sequence: 0, type: "answer", content: "[FAILED] strategy failure" }],
        metrics: { llmCalls: 0, latencyMs: 1 },
      };
    },
  };
  const invalidResult: ReasoningStrategy = {
    name: "invalid",
    async run() {
      return { answer: "", trace: [], metrics: { llmCalls: -1, latencyMs: -1 } };
    },
  };
  const failingStrategy: ReasoningStrategy = {
    name: "failing",
    async run() {
      throw new Error("private implementation detail");
    },
  };
  const { server, url } = await startServer(
    createApp({
      strategies: {
        failed: failedResult,
        invalid: invalidResult,
        failing: failingStrategy,
      },
    }),
  );
  t.after(() => closeServer(server));

  for (const strategy of ["failed", "invalid", "failing"]) {
    const response = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Check the alert",
        userId: "operator-1",
        strategy,
      }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "Internal server error",
    });
  }
});

test("POST /chat selects named strategies and reflects only when requested", async (t) => {
  const calls: string[] = [];
  const reflectedStrategies: string[] = [];
  const react = fakeStrategy("react", calls);
  const alternate = fakeStrategy("alternate", calls);
  const { server, url } = await startServer(
    createApp({
      strategies: { react, alternate },
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

  const alternateResponse = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Investigate",
      userId: "operator-1",
      strategy: "alternate",
    }),
  });
  assert.equal(alternateResponse.status, 200);
  assert.equal(
    (await alternateResponse.json() as ReasoningResult).answer,
    "alternate: Investigate",
  );

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
  assert.deepEqual(await failed.json(), { error: "Internal server error" });
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
