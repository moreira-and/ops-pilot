import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  DatabaseSync,
  type SQLOutputValue,
  type StatementSync,
} from "node:sqlite";
import { z } from "zod";
import {
  EMBEDDING_BLOB_BYTES,
  EMBEDDING_DIMENSIONS,
  embeddingSchema,
  memoryIdentitySchema,
  memoryRecordSchema,
  type MemoryInsertResult,
  type MemoryRecord,
  type MemoryRepository,
} from "../memory/memory-types.js";

type SqlRow = Record<string, SQLOutputValue>;

const thresholdSchema = z.number().finite();

function textField(row: SqlRow, name: string): string {
  const value = row[name];
  if (typeof value !== "string") {
    throw new Error(`SQLite returned an invalid ${name} value.`);
  }
  return value;
}

function embeddingBlob(vector: number[]): Buffer {
  const parsed = embeddingSchema.parse(vector);
  const blob = Buffer.alloc(EMBEDDING_BLOB_BYTES);
  parsed.forEach((value, index) => blob.writeFloatLE(value, index * 4));
  return blob;
}

function decodeEmbedding(value: SQLOutputValue): number[] {
  if (!(value instanceof Uint8Array) || value.byteLength !== EMBEDDING_BLOB_BYTES) {
    throw new Error(
      `SQLite returned an invalid embedding BLOB; expected ${EMBEDDING_BLOB_BYTES} bytes.`,
    );
  }
  const view = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  const vector = Array.from(
    { length: EMBEDDING_DIMENSIONS },
    (_unused, index) => view.readFloatLE(index * 4),
  );
  return embeddingSchema.parse(vector);
}

function dateField(row: SqlRow, name: string): Date {
  const date = new Date(textField(row, name));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`SQLite returned an invalid ${name} date.`);
  }
  return date;
}

function mapMemory(row: SqlRow): MemoryRecord {
  return memoryRecordSchema.parse({
    id: textField(row, "id"),
    userId: textField(row, "user_id"),
    fact: textField(row, "fact"),
    embedding: decodeEmbedding(row.embedding),
    createdAt: dateField(row, "created_at"),
  });
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left.reduce((score, value, index) => score + value * right[index]!, 0);
}

function compareMemories(left: MemoryRecord, right: MemoryRecord): number {
  return left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id);
}

export class SqliteMemoryStore implements MemoryRepository {
  private readonly db: DatabaseSync;
  private readonly selectByUser: StatementSync;
  private readonly insertMemory: StatementSync;
  private readonly deleteMemory: StatementSync;

  constructor(path = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
        fact TEXT NOT NULL CHECK (length(trim(fact)) > 0),
        embedding BLOB NOT NULL
          CHECK (typeof(embedding) = 'blob' AND length(embedding) = ${EMBEDDING_BLOB_BYTES}),
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS memories_user_id_idx
        ON memories(user_id);
    `);

    this.selectByUser = this.db.prepare(`
      SELECT id, user_id, fact, embedding, created_at
      FROM memories
      WHERE user_id = ?
      ORDER BY created_at, id
    `);
    this.insertMemory = this.db.prepare(`
      INSERT INTO memories (id, user_id, fact, embedding, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.deleteMemory = this.db.prepare(
      "DELETE FROM memories WHERE user_id = ? AND id = ?",
    );
  }

  allByUser(userIdInput: string): MemoryRecord[] {
    const userId = memoryIdentitySchema.parse(userIdInput);
    return this.selectByUser.all(userId).map((row) =>
      mapMemory(row as SqlRow)
    );
  }

  insertIfNotSimilar(
    memoryInput: MemoryRecord,
    thresholdInput: number,
  ): MemoryInsertResult {
    const memory = memoryRecordSchema.parse(memoryInput);
    const threshold = thresholdSchema.parse(thresholdInput);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const duplicates = this.allByUser(memory.userId)
        .map((existing) => ({
          memory: existing,
          score: dot(memory.embedding, existing.embedding),
        }))
        .filter(({ score }) => score > threshold)
        .sort((left, right) =>
          right.score - left.score ||
          compareMemories(left.memory, right.memory)
        );
      const duplicate = duplicates[0];
      if (duplicate) {
        this.db.exec("COMMIT");
        return { memory: duplicate.memory, inserted: false };
      }

      this.insertMemory.run(
        memory.id,
        memory.userId,
        memory.fact,
        embeddingBlob(memory.embedding),
        memory.createdAt.toISOString(),
      );
      this.db.exec("COMMIT");
      return { memory, inserted: true };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  deleteByUser(userIdInput: string, memoryIdInput: string): boolean {
    const userId = memoryIdentitySchema.parse(userIdInput);
    const memoryId = memoryIdentitySchema.parse(memoryIdInput);
    return this.deleteMemory.run(userId, memoryId).changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
