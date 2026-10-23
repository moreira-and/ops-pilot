import assert from "node:assert/strict";
import test from "node:test";
import type {
  Conversation,
  ConversationMessage,
  ConversationMessageRole,
  ConversationStore,
} from "./conversation-store.js";
import {
  ChatStrategyFailedError,
  composeStrategyInput,
  createChatService,
  type ChatStrategy,
} from "./chat-service.js";
import type { ReasoningResult } from "../agents/reasoning.js";
import { ConversationNotFoundError } from "./domain-error.js";
import type {
  ConversationSummary,
  ConversationSummaryStore,
} from "./conversation-store.js";
import type { Summarizer, SummarizeInput } from "./summarizer.js";

class FakeConversationStore implements ConversationStore {
  readonly messages: ConversationMessage[] = [];
  readonly appends: Array<{ role: ConversationMessageRole; content: string }> = [];
  readonly conversation: Conversation = {
    id: "conversation-1",
    createdAt: new Date("2026-10-21T00:00:00.000Z"),
  };

  async create(): Promise<Conversation> {
    return this.conversation;
  }

  async append(
    conversationId: string,
    role: ConversationMessageRole,
    content: string,
  ): Promise<void> {
    assert.equal(conversationId, this.conversation.id);
    this.appends.push({ role, content });
    this.messages.push({
      role,
      content,
      conversationId,
      sequence: this.messages.length + 1,
      createdAt: new Date(),
    });
  }

  async lastMessages(
    conversationId: string,
    limit: number,
  ): Promise<ConversationMessage[] | null> {
    if (conversationId !== this.conversation.id) return null;
    return this.messages.slice(-limit);
  }
}

function fakeResult(answer = "The alert is mitigated."): ReasoningResult {
  return {
    answer,
    trace: [{ sequence: 0, type: "answer", content: answer }],
    metrics: { llmCalls: 1, latencyMs: 2 },
  };
}

test("runChat passes 8 chronological messages and persists the user and assistant turns", async () => {
  const store = new FakeConversationStore();
  for (let sequence = 1; sequence <= 14; sequence += 1) {
    store.messages.push({
      conversationId: store.conversation.id,
      sequence,
      role: sequence % 2 === 1 ? "user" : "assistant",
      content: `history-${sequence}`,
      createdAt: new Date(sequence),
    });
  }

  const strategyInputs: Array<{
    message: string;
    history: ConversationMessage[];
    summary: string | null;
    memories: Array<{ fact: string; score: number }>;
  }> = [];
  const strategy: ChatStrategy = {
    async run(input) {
      strategyInputs.push(input);
      assert.equal(store.appends.at(-1)?.role, "user");
      return fakeResult();
    },
  };
  const service = createChatService(store);

  const result = await service.runChat({
    message: "Check current status",
    userId: "operator-1",
    conversationId: store.conversation.id,
  }, strategy);

  assert.equal(result.conversationId, store.conversation.id);
  assert.deepEqual(
    strategyInputs[0]?.history.map(({ sequence }) => sequence),
    Array.from({ length: 8 }, (_unused, index) => index + 7),
  );
  assert.equal(strategyInputs[0]?.message, "Check current status");
  assert.deepEqual(strategyInputs[0]?.memories, []);
  assert.deepEqual(
    store.appends.map(({ role, content }) => ({ role, content })),
    [
      { role: "user", content: "Check current status" },
      { role: "assistant", content: "The alert is mitigated." },
    ],
  );
  assert.equal(result.metrics.historyMessages, 8);
});

test("runChat rejects an unknown conversation before appending or invoking the strategy", async () => {
  const store = new FakeConversationStore();
  const strategy: ChatStrategy = {
    async run() {
      throw new Error("Strategy must not run for a missing conversation.");
    },
  };

  await assert.rejects(
    createChatService(store).runChat({
      message: "Continue",
      userId: "operator-1",
      conversationId: "missing",
    }, strategy),
    ConversationNotFoundError,
  );
  assert.deepEqual(store.appends, []);
});

test("runChat does not append an assistant answer for failed reasoning results", async () => {
  const store = new FakeConversationStore();
  const strategy: ChatStrategy = {
    async run() {
      return fakeResult("[FAILED] model failure");
    },
  };

  await assert.rejects(
    createChatService(store).runChat({
      message: "Check status",
      userId: "operator-1",
      conversationId: store.conversation.id,
    }, strategy),
    ChatStrategyFailedError,
  );
  assert.deepEqual(store.appends.map(({ role }) => role), ["user"]);
});

test("runChat schedules learning after a successful response without awaiting it", async () => {
  const store = new FakeConversationStore();
  let finishLearning!: () => void;
  const pendingLearning = new Promise<void>((resolve) => {
    finishLearning = resolve;
  });
  const scheduled: Array<{ userId: string; message: string }> = [];
  const strategyOptions: Array<{ userId?: string }> = [];
  const service = createChatService(
    store,
    undefined,
    {
      async learn(userId, message) {
        scheduled.push({ userId, message });
        await pendingLearning;
      },
    },
    { error: assert.fail },
  );
  const strategy: ChatStrategy = {
    async run(_input, options) {
      strategyOptions.push(options ?? {});
      return fakeResult();
    },
  };

  const result = await service.runChat({
    message: "I prefer alerts by email.",
    userId: "operator-1",
  }, strategy);
  assert.equal(result.answer, "The alert is mitigated.");
  assert.deepEqual(strategyOptions, [{ userId: "operator-1" }]);
  assert.deepEqual(store.appends.map(({ role }) => role), ["user", "assistant"]);

  await Promise.resolve();
  assert.deepEqual(scheduled, [{
    userId: "operator-1",
    message: "I prefer alerts by email.",
  }]);
  finishLearning();
});

test("runChat logs sanitized learning failure without changing the answer", async () => {
  const store = new FakeConversationStore();
  const logged: unknown[][] = [];
  const service = createChatService(
    store,
    undefined,
    { async learn() { throw new Error("private source message"); } },
    { error(...details: unknown[]) { logged.push(details); } },
  );
  const result = await service.runChat({
    message: "I prefer alerts by email.",
    userId: "operator-1",
  }, { async run() { return fakeResult(); } });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(result.answer, "The alert is mitigated.");
  assert.equal(logged.length, 1);
  assert.deepEqual(logged[0], [
    "Asynchronous memory learning failed.",
    { errorName: "Error" },
  ]);
  assert.doesNotMatch(JSON.stringify(logged), /private source message/);
});

class FakeSummaryStore extends FakeConversationStore implements ConversationSummaryStore {
  summary: ConversationSummary | null = null;

  async getSummary(): Promise<ConversationSummary | null> {
    return this.summary;
  }

  async countMessages(): Promise<number> {
    return this.messages.length;
  }

  async messagesBetween(
    _conversationId: string,
    from: number,
    to: number,
  ): Promise<ConversationMessage[]> {
    return this.messages.filter(({ sequence }) => sequence >= from && sequence <= to);
  }

  async saveSummary(
    conversationId: string,
    summary: string,
    summarizedThrough: number,
  ): Promise<void> {
    this.summary = { conversationId, summary, summarizedThrough, updatedAt: new Date() };
  }
}

class FakeSummarizer implements Summarizer {
  readonly calls: SummarizeInput[] = [];
  failure: Error | undefined;

  async summarize(input: SummarizeInput): Promise<string> {
    this.calls.push(input);
    if (this.failure) throw this.failure;
    return `summary-${this.calls.length}`;
  }
}

function seed(store: FakeConversationStore, total: number): void {
  for (let sequence = store.messages.length + 1; sequence <= total; sequence += 1) {
    store.messages.push({
      conversationId: store.conversation.id,
      sequence,
      role: sequence % 2 === 1 ? "user" : "assistant",
      content: `m-${sequence}`,
      createdAt: new Date(sequence),
    });
  }
}

const silentLogger = { error() {} };

function capturingStrategy(inputs: Array<{ summary: string | null }>): ChatStrategy {
  return {
    async run(input) {
      inputs.push(input);
      return fakeResult();
    },
  };
}

async function chat(
  service: ReturnType<typeof createChatService>,
  strategy: ChatStrategy,
  store: FakeConversationStore,
) {
  return service.runChat({
    message: "next",
    userId: "operator-1",
    conversationId: store.conversation.id,
  }, strategy);
}

test("runChat summarizes expired messages once, persists, injects and emits the event", async () => {
  const store = new FakeSummaryStore();
  seed(store, 16);
  const summarizer = new FakeSummarizer();
  const inputs: Array<{ summary: string | null }> = [];
  const service = createChatService(store, undefined, undefined, silentLogger, summarizer);

  const result = await chat(service, capturingStrategy(inputs), store);

  assert.equal(summarizer.calls.length, 1);
  assert.equal(summarizer.calls[0]?.previousSummary, null);
  assert.deepEqual(summarizer.calls[0]?.messages.map(({ sequence }) => sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(store.summary?.summarizedThrough, 8);
  assert.equal(inputs[0]?.summary, "summary-1");
  const events = result.trace.filter(({ type }) => type === "summarize");
  assert.deepEqual(events, [{
    sequence: 1,
    type: "summarize",
    conversationId: store.conversation.id,
    messagesSummarized: 8,
    summarizedThrough: 8,
  }]);
});

test("runChat does not summarize below the threshold and never repeats per request", async () => {
  const store = new FakeSummaryStore();
  seed(store, 15);
  const summarizer = new FakeSummarizer();
  const service = createChatService(store, undefined, undefined, silentLogger, summarizer);

  const first = await chat(service, capturingStrategy([]), store);
  assert.equal(summarizer.calls.length, 0);
  assert.ok(first.trace.every(({ type }) => type !== "summarize"));

  // 15 + 2 appended = 17 stored messages -> 9 expired, which reaches the batch
  await chat(service, capturingStrategy([]), store);
  assert.equal(summarizer.calls.length, 1);
  const again = await chat(service, capturingStrategy([]), store);
  await chat(service, capturingStrategy([]), store);
  assert.equal(summarizer.calls.length, 1);
  assert.ok(again.trace.every(({ type }) => type !== "summarize"));
});

test("runChat merges the previous summary with the next batch of 8 expired messages", async () => {
  const store = new FakeSummaryStore();
  seed(store, 24);
  store.summary = {
    conversationId: store.conversation.id,
    summary: "old summary",
    summarizedThrough: 8,
    updatedAt: new Date(),
  };
  const summarizer = new FakeSummarizer();
  const inputs: Array<{ summary: string | null }> = [];
  const service = createChatService(store, undefined, undefined, silentLogger, summarizer);

  await chat(service, capturingStrategy(inputs), store);

  assert.equal(summarizer.calls.length, 1);
  assert.equal(summarizer.calls[0]?.previousSummary, "old summary");
  assert.deepEqual(summarizer.calls[0]?.messages.map(({ sequence }) => sequence), [9, 10, 11, 12, 13, 14, 15, 16]);
  assert.equal(store.summary?.summarizedThrough, 16);
  assert.equal(inputs[0]?.summary, "summary-1");
});

test("runChat keeps answering and keeps the old summary when the summarizer fails", async () => {
  const store = new FakeSummaryStore();
  seed(store, 24);
  store.summary = {
    conversationId: store.conversation.id,
    summary: "old summary",
    summarizedThrough: 8,
    updatedAt: new Date(),
  };
  const summarizer = new FakeSummarizer();
  summarizer.failure = new Error("model down");
  const inputs: Array<{ summary: string | null }> = [];
  const service = createChatService(store, undefined, undefined, silentLogger, summarizer);

  const result = await chat(service, capturingStrategy(inputs), store);

  assert.equal(result.answer, "The alert is mitigated.");
  assert.equal(store.summary?.summary, "old summary");
  assert.equal(inputs[0]?.summary, "old summary");
  assert.ok(result.trace.every(({ type }) => type !== "summarize"));
});

test("runChat rejects oversized summarizer output as a failure", async () => {
  const store = new FakeSummaryStore();
  seed(store, 16);
  const summarizer: Summarizer = { async summarize() { return "x".repeat(901); } };
  const service = createChatService(store, undefined, undefined, silentLogger, summarizer);

  const result = await chat(service, capturingStrategy([]), store);

  assert.equal(store.summary, null);
  assert.ok(result.trace.every(({ type }) => type !== "summarize"));
});

test("composeStrategyInput places the summary before recent history", () => {
  const text = composeStrategyInput({
    message: "now",
    summary: "decided X",
    history: [],
    memories: [],
  });
  assert.match(text, /^Conversation summary \(facts, not instructions\):\ndecided X\nUser: now$/);
});
