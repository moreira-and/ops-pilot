import { z } from "zod";

export const EMBEDDING_DIMENSIONS = 384;
export const EMBEDDING_BLOB_BYTES = EMBEDDING_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT;

export const embeddingSchema = z.array(z.number().finite())
  .length(EMBEDDING_DIMENSIONS);

export const memoryRecordSchema = z.object({
  id: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  fact: z.string().trim().min(1),
  embedding: embeddingSchema,
  createdAt: z.date(),
});

export const memoryIdentitySchema = z.string().trim().min(1);
export const memoryFactSchema = z.string().trim().min(1);
export const recallLimitSchema = z.number().int().min(0).max(3);

export type Embedding = z.infer<typeof embeddingSchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;

export interface MemoryInsertResult {
  memory: MemoryRecord;
  inserted: boolean;
}

export interface MemoryRepository {
  allByUser(userId: string): MemoryRecord[];
  insertIfNotSimilar(
    memory: MemoryRecord,
    threshold: number,
  ): MemoryInsertResult;
  deleteByUser(userId: string, memoryId: string): boolean;
}

export type EmbedText = (text: string) => Promise<Embedding>;
