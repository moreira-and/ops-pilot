import assert from "node:assert/strict";
import test from "node:test";
import { embed } from "./embeddings.js";
import { MemoryStore } from "./memory-store.js";
import { SqliteMemoryStore } from "../store/sqlite-memory-store.js";

test(
  "semantic recall matches a paraphrase without shared content words",
  { skip: process.env.OPSPILOT_RUN_MODEL_TESTS !== "1" },
  async () => {
    const repository = new SqliteMemoryStore(":memory:");
    const memories = new MemoryStore(repository, embed);
    try {
      const remembered = await memories.remember(
        "semantic-test-user",
        "Preferred alert delivery is electronic mail.",
      );
      const recalled = await memories.recall(
        "semantic-test-user",
        "How does the operator wish to receive incident updates?",
      );

      assert.ok(
        recalled.some(({ id, score }) => id === remembered.id && score > 0.3),
      );
    } finally {
      repository.close();
    }
  },
);
