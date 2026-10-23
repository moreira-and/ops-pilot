import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  EMBEDDING_DIMENSIONS,
  type MemoryRecord,
} from "../memory/memory-types.js";
import { SqliteMemoryStore } from "./sqlite-memory-store.js";

function memory(
  id: string,
  userId: string,
  value: number,
): MemoryRecord {
  return {
    id,
    userId,
    fact: `fact-${id}`,
    embedding: new Array(EMBEDDING_DIMENSIONS).fill(value),
    createdAt: new Date("2026-10-22T00:00:00.000Z"),
  };
}

test("SQLite memory store keeps users isolated and round-trips Float32 vectors", () => {
  const store = new SqliteMemoryStore(":memory:");
  try {
    const first = store.insertIfNotSimilar(memory("one", "alice", 1), 0.92);
    const second = store.insertIfNotSimilar(memory("two", "bob", 1), 0.92);

    assert.equal(first.inserted, true);
    assert.equal(second.inserted, true);
    assert.deepEqual(store.allByUser("alice"), [memory("one", "alice", 1)]);
    assert.deepEqual(store.allByUser("bob"), [memory("two", "bob", 1)]);
    assert.deepEqual(store.allByUser("missing"), []);
  } finally {
    store.close();
  }
});

test("SQLite memory store creates the specified memories table and user index", () => {
  const directory = mkdtempSync(join(tmpdir(), "ops-pilot-memory-"));
  const path = join(directory, "memory.db");
  const store = new SqliteMemoryStore(path);
  store.close();
  try {
    const db = new DatabaseSync(path);
    try {
      const columns = db.prepare("PRAGMA table_info(memories)").all()
        .map((row) => row.name);
      const indexes = db.prepare("PRAGMA index_list(memories)").all()
        .map((row) => row.name);
      assert.deepEqual(columns, [
        "id",
        "user_id",
        "fact",
        "embedding",
        "created_at",
      ]);
      assert.ok(indexes.includes("memories_user_id_idx"));
    } finally {
      db.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("SQLite memory store retains the strongest duplicate and scopes deletion by owner", () => {
  const store = new SqliteMemoryStore(":memory:");
  try {
    store.insertIfNotSimilar(memory("first", "alice", 1), 0.92);
    const duplicate = store.insertIfNotSimilar(memory("duplicate", "alice", 1), 0.92);
    assert.equal(duplicate.inserted, false);
    assert.equal(duplicate.memory.id, "first");
    assert.equal(store.deleteByUser("bob", "first"), false);
    assert.deepEqual(store.allByUser("alice").map(({ id }) => id), ["first"]);
    assert.equal(store.deleteByUser("alice", "first"), true);
    assert.deepEqual(store.allByUser("alice"), []);
  } finally {
    store.close();
  }
});
