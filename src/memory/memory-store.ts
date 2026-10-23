import { randomUUID } from "node:crypto";
import {
  embeddingSchema,
  memoryFactSchema,
  memoryIdentitySchema,
  memoryRecordSchema,
  recallLimitSchema,
  type EmbedText,
  type MemoryRecord,
  type MemoryRepository,
} from "./memory-types.js";

export const MEMORY_DEDUPLICATION_THRESHOLD = 0.92;
export const MEMORY_RECALL_THRESHOLD = 0.3;

export interface RecalledMemory extends MemoryRecord {
  score: number;
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left.reduce((score, value, index) => score + value * right[index]!, 0);
}

function compareRecalled(left: RecalledMemory, right: RecalledMemory): number {
  return right.score - left.score ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id);
}

export class MemoryStore {
  constructor(
    private readonly repository: MemoryRepository,
    private readonly embed: EmbedText,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async remember(userIdInput: string, factInput: string): Promise<MemoryRecord> {
    const userId = memoryIdentitySchema.parse(userIdInput);
    const fact = memoryFactSchema.parse(factInput);
    const embedding = embeddingSchema.parse(await this.embed(fact));
    const record = memoryRecordSchema.parse({
      id: randomUUID(),
      userId,
      fact,
      embedding,
      createdAt: this.now(),
    });
    return this.repository.insertIfNotSimilar(
      record,
      MEMORY_DEDUPLICATION_THRESHOLD,
    ).memory;
  }

  async recall(
    userIdInput: string,
    queryInput: string,
    kInput = 3,
  ): Promise<RecalledMemory[]> {
    const userId = memoryIdentitySchema.parse(userIdInput);
    const query = memoryFactSchema.parse(queryInput);
    const k = recallLimitSchema.parse(kInput);
    const queryEmbedding = embeddingSchema.parse(await this.embed(query));
    const memories = this.repository.allByUser(userId);
    if (k === 0) return [];

    return memories
      .map((memory) => ({
        ...memoryRecordSchema.parse(memory),
        score: dot(queryEmbedding, memory.embedding),
      }))
      .sort(compareRecalled)
      .slice(0, k)
      .filter((memory) => memory.score > MEMORY_RECALL_THRESHOLD);
  }

  forget(userIdInput: string, memoryIdInput: string): boolean {
    const userId = memoryIdentitySchema.parse(userIdInput);
    const memoryId = memoryIdentitySchema.parse(memoryIdInput);
    return this.repository.deleteByUser(userId, memoryId);
  }
}
