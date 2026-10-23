import { z } from "zod";
import {
  reasoningResultSchema,
  type ReasoningOptions,
  type ReasoningResult,
} from "../agents/reasoning.js";
import {
  conversationMessageSchema,
  hasSummaryStore,
  type ConversationMessage,
  type ConversationStore,
  type ConversationSummaryStore,
} from "./conversation-store.js";
import { HISTORY_WINDOW, planPruning } from "./history-pruning.js";
import { validateSummary, type Summarizer } from "./summarizer.js";
import { ConversationNotFoundError } from "./domain-error.js";
import type { RecalledMemory } from "../memory/memory-store.js";
import {
  logLearningFailure,
  type LearningLogger,
} from "./learning-service.js";
import {
  buildContext,
  DEFAULT_CONTEXT_BUDGET,
  type ContextBudget,
} from "../context/context-builder.js";

const chatInputSchema = z.object({
  message: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  conversationId: z.string().trim().min(1).optional(),
});

const memoryContextSchema = z.object({
  fact: z.string().trim().min(1),
  score: z.number().finite(),
});

const chatStrategyInputSchema = z.object({
  message: z.string().trim().min(1),
  history: z.array(conversationMessageSchema).max(HISTORY_WINDOW),
  summary: z.string().trim().min(1).nullable(),
  memories: z.array(memoryContextSchema).max(3),
});

const chatResponseSchema = reasoningResultSchema.extend({
  conversationId: z.string().trim().min(1),
  metrics: reasoningResultSchema.shape.metrics.extend({
    historyMessages: z.number().int().min(0).max(HISTORY_WINDOW),
  }),
});

export interface ChatStrategyInput {
  message: string;
  history: ConversationMessage[];
  summary: string | null;
  memories: Array<Pick<RecalledMemory, "fact" | "score">>;
}

export interface MemoryRecallStore {
  recall(userId: string, query: string): Promise<RecalledMemory[]>;
}

export interface ChatStrategy {
  run(input: ChatStrategyInput, options?: ReasoningOptions): Promise<ReasoningResult>;
}

export interface ChatLearningService {
  learn(userId: string, message: string): Promise<unknown>;
}

export class ChatStrategyFailedError extends Error {
  constructor() {
    super("Chat strategy returned a failed result.");
    this.name = "ChatStrategyFailedError";
  }
}

export function composeStrategyInput(
  input: ChatStrategyInput,
  budget: ContextBudget = DEFAULT_CONTEXT_BUDGET,
): string {
  return buildContext({
    ...input,
    history: input.history.map(({ role, content }) => ({ role, content })),
  }, budget).prompt;
}

export function createChatService(
  store: ConversationStore,
  memoryStore?: MemoryRecallStore,
  learningService?: ChatLearningService,
  learningLogger: LearningLogger = console,
  summarizer?: Summarizer,
) {
  async function pruneHistory(conversationId: string) {
    if (!summarizer || !hasSummaryStore(store)) {
      return { summary: null, event: null };
    }
    const summaryStore: ConversationSummaryStore = store;
    const current = await summaryStore.getSummary(conversationId);
    let summary = current?.summary ?? null;
    const plan = planPruning({
      totalMessages: await summaryStore.countMessages(conversationId),
      summarizedThrough: current?.summarizedThrough ?? 0,
    });
    if (!plan) return { summary, event: null };
    try {
      const messages = await summaryStore.messagesBetween(
        conversationId,
        plan.fromSequence,
        plan.toSequence,
      );
      const merged = validateSummary(
        await summarizer.summarize({ previousSummary: summary, messages }),
      );
      await summaryStore.saveSummary(conversationId, merged, plan.toSequence);
      summary = merged;
      return {
        summary,
        event: {
          conversationId,
          messagesSummarized: messages.length,
          summarizedThrough: plan.toSequence,
        },
      };
    } catch (error) {
      learningLogger.error("Conversation summarization failed.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return { summary, event: null };
    }
  }

  return {
    async runChat(
      inputValue: {
        message: string;
        userId: string;
        conversationId?: string;
      },
      strategy: ChatStrategy,
    ) {
      const input = chatInputSchema.parse(inputValue);
      let conversationId = input.conversationId;
      let history: ConversationMessage[] = [];
      if (conversationId) {
        const existingHistory = await store.lastMessages(conversationId, HISTORY_WINDOW);
        if (existingHistory === null) {
          throw new ConversationNotFoundError(conversationId);
        }
        history = existingHistory;
      }

      const memories = memoryStore
        ? await memoryStore.recall(input.userId, input.message)
        : [];
      conversationId ??= (await store.create()).id;
      if (!input.conversationId) {
        const newHistory = await store.lastMessages(conversationId, HISTORY_WINDOW);
        if (newHistory === null) {
          throw new ConversationNotFoundError(conversationId);
        }
        history = newHistory;
      }
      const { summary, event } = await pruneHistory(conversationId);
      const strategyInput = chatStrategyInputSchema.parse({
        message: input.message,
        history,
        summary,
        memories: memories.map(({ fact, score }) => ({ fact, score })),
      });
      await store.append(conversationId, "user", input.message);

      const result = reasoningResultSchema.parse(
        await strategy.run(strategyInput, { userId: input.userId }),
      );
      if (result.answer.startsWith("[FAILED]")) {
        throw new ChatStrategyFailedError();
      }

      await store.append(conversationId, "assistant", result.answer);

      const trace = event
        ? [
          ...result.trace,
          {
            sequence: Math.max(-1, ...result.trace.map((e) => e.sequence)) + 1,
            type: "summarize" as const,
            ...event,
          },
        ]
        : result.trace;
      const response = chatResponseSchema.parse({
        ...result,
        trace,
        conversationId,
        metrics: {
          ...result.metrics,
          historyMessages: history.length,
        },
      });
      if (learningService) {
        void Promise.resolve()
          .then(() => learningService.learn(input.userId, input.message))
          .catch((error: unknown) => {
            logLearningFailure(learningLogger, error);
          });
      }
      return response;
    },
  };
}
