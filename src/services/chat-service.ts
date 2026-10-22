import { z } from "zod";
import {
  reasoningResultSchema,
  type ReasoningResult,
} from "../agents/reasoning.js";
import {
  conversationMessageSchema,
  type ConversationMessage,
  type ConversationStore,
} from "./conversation-store.js";
import { ConversationNotFoundError } from "./domain-error.js";

const chatInputSchema = z.object({
  message: z.string().trim().min(1),
  conversationId: z.string().trim().min(1).optional(),
});

const chatStrategyInputSchema = z.object({
  message: z.string().trim().min(1),
  history: z.array(conversationMessageSchema).max(12),
});

const chatResponseSchema = reasoningResultSchema.extend({
  conversationId: z.string().trim().min(1),
  metrics: reasoningResultSchema.shape.metrics.extend({
    historyMessages: z.number().int().min(0).max(12),
  }),
});

export interface ChatStrategyInput {
  message: string;
  history: ConversationMessage[];
}

export interface ChatStrategy {
  run(input: ChatStrategyInput): Promise<ReasoningResult>;
}

export class ChatStrategyFailedError extends Error {
  constructor() {
    super("Chat strategy returned a failed result.");
    this.name = "ChatStrategyFailedError";
  }
}

export function composeStrategyInput(input: ChatStrategyInput): string {
  if (input.history.length === 0) return input.message;
  const history = input.history.map(({ role, content }) =>
    `${role === "user" ? "User" : "Assistant"}: ${content}`
  );
  return [
    "Conversation history:",
    ...history,
    `User: ${input.message}`,
  ].join("\n");
}

export function createChatService(store: ConversationStore) {
  return {
    async runChat(
      inputValue: { message: string; conversationId?: string },
      strategy: ChatStrategy,
    ) {
      const input = chatInputSchema.parse(inputValue);
      const conversationId = input.conversationId ??
        (await store.create()).id;
      const history = await store.lastMessages(conversationId, 12);
      if (history === null) {
        throw new ConversationNotFoundError(conversationId);
      }

      const strategyInput = chatStrategyInputSchema.parse({
        message: input.message,
        history,
      });
      await store.append(conversationId, "user", input.message);

      const result = reasoningResultSchema.parse(
        await strategy.run(strategyInput),
      );
      if (result.answer.startsWith("[FAILED]")) {
        throw new ChatStrategyFailedError();
      }

      await store.append(conversationId, "assistant", result.answer);

      return chatResponseSchema.parse({
        ...result,
        conversationId,
        metrics: {
          ...result.metrics,
          historyMessages: history.length,
        },
      });
    },
  };
}
