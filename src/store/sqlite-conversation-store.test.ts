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
    assert.deepEqual(await store.lastMessages(conversation.id, 12), []);

    for (let index = 0; index < 14; index += 1) {
      await store.append(
        conversation.id,
        index % 2 === 0 ? "user" : "assistant",
        `message-${index}`,
      );
    }

    const messages = await store.lastMessages(conversation.id, 12);
    assert.ok(messages);
    assert.deepEqual(
      messages.map(({ content }) => content),
      Array.from({ length: 12 }, (_unused, index) => `message-${index + 2}`),
    );
    assert.deepEqual(
      messages.map(({ sequence }) => sequence),
      Array.from({ length: 12 }, (_unused, index) => index + 3),
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
    assert.deepEqual(await store.lastMessages(conversation.id, 12), []);
    assert.equal(await store.lastMessages("missing", 12), null);
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
    await assert.rejects(store.lastMessages(conversation.id, 13));
  } finally {
    store.close();
  }
});
