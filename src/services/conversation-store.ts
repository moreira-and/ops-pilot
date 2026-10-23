import { z } from "zod";

export const conversationSchema = z.object({
  id: z.string().trim().min(1),
  createdAt: z.date(),
});

export const conversationMessageRoleSchema = z.enum(["user", "assistant"]);

export const conversationMessageSchema = z.object({
  sequence: z.number().int().positive(),
  conversationId: z.string().trim().min(1),
  role: conversationMessageRoleSchema,
  content: z.string().trim().min(1),
  createdAt: z.date(),
});

export const newConversationMessageSchema = z.object({
  role: conversationMessageRoleSchema,
  content: z.string().trim().min(1),
});

export const MAX_SUMMARY_LENGTH = 900;

export const conversationSummarySchema = z.object({
  conversationId: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(MAX_SUMMARY_LENGTH),
  summarizedThrough: z.number().int().positive(),
  updatedAt: z.date(),
});

export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type ConversationMessageRole = z.infer<
  typeof conversationMessageRoleSchema
>;

export interface ConversationStore {
  create(): Promise<Conversation>;
  append(
    conversationId: string,
    role: ConversationMessageRole,
    content: string,
  ): Promise<void>;
  lastMessages(
    conversationId: string,
    limit: number,
  ): Promise<ConversationMessage[] | null>;
}

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export interface ConversationSummaryStore {
  getSummary(conversationId: string): Promise<ConversationSummary | null>;
  countMessages(conversationId: string): Promise<number>;
  messagesBetween(
    conversationId: string,
    fromSequence: number,
    toSequence: number,
  ): Promise<ConversationMessage[]>;
  saveSummary(
    conversationId: string,
    summary: string,
    summarizedThrough: number,
  ): Promise<void>;
}

export function hasSummaryStore<T extends ConversationStore>(
  store: T,
): store is T & ConversationSummaryStore {
  const candidate = store as Partial<ConversationSummaryStore>;
  return typeof candidate.getSummary === "function" &&
    typeof candidate.countMessages === "function" &&
    typeof candidate.messagesBetween === "function" &&
    typeof candidate.saveSummary === "function";
}
