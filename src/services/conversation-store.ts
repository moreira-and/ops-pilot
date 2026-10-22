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
