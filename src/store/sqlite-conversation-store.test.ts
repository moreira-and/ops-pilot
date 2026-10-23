import assert from "node:assert/strict";
import test from "node:test";
import { newConversationMessageSchema } from "../services/conversation-store.js";
import { SqliteConversationStore } from "./sqlite-conversation-store.js";

test("creates conversations and retrieves recent messages chronologically", async () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    const conversation = await store.create();
    const secondConversation = await store.create();

    assert.notEqual(conversation.id, secondConversation.id);
    assert.deepEqual(await store.lastMessages(conversation.id, 8), []);

    for (let index = 0; index < 14; index += 1) {
      await store.append(
        conversation.id,
        index % 2 === 0 ? "user" : "assistant",
        `message-${index}`,
      );
    }

    const messages = await store.lastMessages(conversation.id, 8);
    assert.ok(messages);
    assert.deepEqual(
      messages.map(({ content }) => content),
      Array.from({ length: 8 }, (_unused, index) => `message-${index + 6}`),
    );
    assert.deepEqual(
      messages.map(({ sequence }) => sequence),
      Array.from({ length: 8 }, (_unused, index) => index + 7),
    );
    assert.ok(messages.every(({ conversationId }) => conversationId === conversation.id));
  } finally {
    store.close();
  }
});

test("distinguishes an unknown conversation from a known empty one", async () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    const conversation = await store.create();
    assert.deepEqual(await store.lastMessages(conversation.id, 8), []);
    assert.equal(await store.lastMessages("missing", 8), null);
  } finally {
    store.close();
  }
});

test("rejects invalid messages, orphan appends, and invalid history limits", async () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    const conversation = await store.create();

    await assert.rejects(
      store.append(conversation.id, "user", "  "),
    );
    assert.throws(() =>
      newConversationMessageSchema.parse({ role: "system", content: "hello" }),
    );
    await assert.rejects(
      store.append("missing", "user", "hello"),
    );
    await assert.rejects(store.lastMessages(conversation.id, 9));
  } finally {
    store.close();
  }
});

test("persists and upserts conversation summaries without regressing progress", async () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    const conversation = await store.create();
    for (let index = 0; index < 10; index += 1) {
      await store.append(conversation.id, index % 2 === 0 ? "user" : "assistant", `m-${index + 1}`);
    }
    assert.equal(await store.getSummary(conversation.id), null);
    assert.equal(await store.countMessages(conversation.id), 10);
    assert.deepEqual(
      (await store.messagesBetween(conversation.id, 3, 5)).map(({ sequence }) => sequence),
      [3, 4, 5],
    );

    await store.saveSummary(conversation.id, "first", 8);
    await store.saveSummary(conversation.id, "stale", 4);
    const stored = await store.getSummary(conversation.id);
    assert.equal(stored?.summary, "first");
    assert.equal(stored?.summarizedThrough, 8);

    await store.saveSummary(conversation.id, "second", 16);
    assert.equal((await store.getSummary(conversation.id))?.summary, "second");
  } finally {
    store.close();
  }
});

test("rejects empty, oversized and orphan summaries", async () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    const conversation = await store.create();
    await assert.rejects(store.saveSummary(conversation.id, "  ", 1));
    await assert.rejects(store.saveSummary(conversation.id, "x".repeat(901), 1));
    await assert.rejects(store.saveSummary("missing", "ok", 1));
    await assert.rejects(store.saveSummary(conversation.id, "ok", 0));
  } finally {
    store.close();
  }
});
