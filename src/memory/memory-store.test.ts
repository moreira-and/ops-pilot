import assert from "node:assert/strict";
import test from "node:test";
import {
  EMBEDDING_DIMENSIONS,
  type EmbedText,
  type MemoryInsertResult,
  type MemoryRecord,
  type MemoryRepository,
} from "./memory-types.js";
import {
  MemoryStore,
  MEMORY_DEDUPLICATION_THRESHOLD,
  MEMORY_RECALL_THRESHOLD,
} from "./memory-store.js";

function vector(index: number, value = 1): number[] {
  const result = new Array(EMBEDDING_DIMENSIONS).fill(0);
  result[index] = value;
  return result;
}

class FakeMemoryRepository implements MemoryRepository {
  readonly records: MemoryRecord[] = [];
  readonly requestedUsers: string[] = [];
  readonly deleted: Array<{ userId: string; memoryId: string }> = [];

  allByUser(userId: string): MemoryRecord[] {
    this.requestedUsers.push(userId);
    return this.records.filter((record) => record.userId === userId);
  }

  insertIfNotSimilar(
    memory: MemoryRecord,
    threshold: number,
  ): MemoryInsertResult {
    const duplicate = this.allByUser(memory.userId)
      .map((record) => ({
        record,
        score: record.embedding.reduce(
          (score, value, index) => score + value * memory.embedding[index]!,
          0,
        ),
      }))
      .filter(({ score }) => score > threshold)
      .sort((left, right) => right.score - left.score)[0]?.record;
    if (duplicate) return { memory: duplicate, inserted: false };
    this.records.push(memory);
    return { memory, inserted: true };
  }

  deleteByUser(userId: string, memoryId: string): boolean {
    this.deleted.push({ userId, memoryId });
    const index = this.records.findIndex((record) =>
      record.userId === userId && record.id === memoryId
    );
    if (index < 0) return false;
    this.records.splice(index, 1);
    return true;
  }
}

function makeStore(
  repository = new FakeMemoryRepository(),
  embeddings: Record<string, number[]> = {},
) {
  const embedCalls: string[] = [];
  const embed: EmbedText = async (text) => {
    embedCalls.push(text);
    return embeddings[text] ?? vector(0);
  };
  const store = new MemoryStore(
    repository,
    embed,
    () => new Date("2026-10-22T00:00:00.000Z"),
  );
  return { store, repository, embedCalls };
}

test("remember persists a validated fact with an ID and creation time", async () => {
  const { store, repository } = makeStore();
  const memory = await store.remember(" alice ", " Incident fallback is Frankfurt. ");

  assert.equal(memory.userId, "alice");
  assert.equal(memory.fact, "Incident fallback is Frankfurt.");
  assert.ok(memory.id.length > 0);
  assert.equal(memory.createdAt.toISOString(), "2026-10-22T00:00:00.000Z");
  assert.equal(repository.records.length, 1);
});

test("remember rejects blank owner or fact before embedding", async () => {
  const { store, embedCalls } = makeStore();
  await assert.rejects(store.remember(" ", "fact"));
  await assert.rejects(store.remember("alice", " "));
  assert.deepEqual(embedCalls, []);
});

test("remember treats only dot products strictly above 0.92 as duplicates", async () => {
  const basis = vector(0);
  const exactThreshold = vector(0, 0.92);
  const aboveThreshold = vector(0, 0.9201);
  const { store, repository } = makeStore(undefined, {
    original: basis,
    exact: exactThreshold,
    above: aboveThreshold,
  });

  const original = await store.remember("alice", "original");
  const atThreshold = await store.remember("alice", "exact");
  const above = await store.remember("alice", "above");

  assert.notEqual(atThreshold.id, original.id);
  assert.equal(above.id, original.id);
  assert.equal(repository.records.length, 2);
  assert.equal(MEMORY_DEDUPLICATION_THRESHOLD, 0.92);
});

test("recall scopes records to the user, sorts by dot product, slices top k then filters strictly above 0.3", async () => {
  const repository = new FakeMemoryRepository();
  const createdAt = new Date("2026-10-22T00:00:00.000Z");
  repository.records.push(
    { id: "strong", userId: "alice", fact: "strong", embedding: vector(0, 0.9), createdAt },
    { id: "medium", userId: "alice", fact: "medium", embedding: vector(0, 0.8), createdAt },
    { id: "weak-at-cutoff", userId: "alice", fact: "weak", embedding: vector(0, 0.3), createdAt },
    { id: "other-user", userId: "bob", fact: "private", embedding: vector(0, 1), createdAt },
  );
  const { store } = makeStore(repository);

  const recalled = await store.recall("alice", "query");

  assert.deepEqual(recalled.map(({ id }) => id), ["strong", "medium"]);
  assert.deepEqual(repository.requestedUsers, ["alice"]);
  assert.equal(MEMORY_RECALL_THRESHOLD, 0.3);
});

test("forget deletes only the owner's record and reports missing IDs", () => {
  const repository = new FakeMemoryRepository();
  repository.records.push({
    id: "secret",
    userId: "alice",
    fact: "private",
    embedding: vector(0),
    createdAt: new Date(),
  });
  const { store } = makeStore(repository);

  assert.equal(store.forget("bob", "secret"), false);
  assert.equal(store.forget("alice", "missing"), false);
  assert.equal(store.forget("alice", "secret"), true);
  assert.equal(repository.records.length, 0);
});
