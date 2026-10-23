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
  createChatService,
  type ChatStrategy,
} from "./chat-service.js";
import type { ReasoningResult } from "../agents/reasoning.js";
import { ConversationNotFoundError } from "./domain-error.js";

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

test("runChat passes 12 chronological messages and persists the user and assistant turns", async () => {
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
    Array.from({ length: 12 }, (_unused, index) => index + 3),
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
  assert.equal(result.metrics.historyMessages, 12);
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
