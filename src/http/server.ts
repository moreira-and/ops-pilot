import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { strategyRegistry } from "../agents/index.js";
import { withReflection } from "../agents/reflection.js";
import {
  reasoningMetricsSchema,
  reasoningResultSchema,
  type ReasoningStrategy,
} from "../agents/reasoning.js";
import {
  ChatStrategyFailedError,
  composeStrategyInput,
  createChatService,
  type ChatLearningService,
  type MemoryRecallStore,
} from "../services/chat-service.js";
import type { ConversationStore } from "../services/conversation-store.js";
import { ConversationNotFoundError } from "../services/domain-error.js";
import type { Summarizer } from "../services/summarizer.js";
import { SqliteConversationStore } from "../store/sqlite-conversation-store.js";

const chatRequestSchema = z.object({
  message: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  strategy: z.string().trim().min(1).default("react"),
  reflact: z.boolean().default(false),
  conversationId: z.string().trim().min(1).optional(),
});

const chatResponseSchema = reasoningResultSchema.extend({
  conversationId: z.string().trim().min(1),
  metrics: reasoningMetricsSchema.extend({
    historyMessages: z.number().int().min(0).max(8),
  }),
});

const DEFAULT_TIMEOUT_MS = 180_000;

export interface ChatServerOptions {
  strategies?: Record<string, ReasoningStrategy>;
  reflectionDecorator?: (strategy: ReasoningStrategy) => ReasoningStrategy;
  conversationStore?: ConversationStore;
  memoryStore?: MemoryRecallStore;
  learningService?: ChatLearningService;
  summarizer?: Summarizer;
  timeoutMs?: number;
}

class StrategyTimeoutError extends Error {
  constructor() {
    super("Strategy execution timed out.");
    this.name = "StrategyTimeoutError";
  }
}

async function runWithTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new StrategyTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function sendFailure(
  error: unknown,
  response: Response,
): void {
  if (error instanceof ConversationNotFoundError) {
    response.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (error instanceof ChatStrategyFailedError) {
    response.status(500).json({ error: "Internal server error" });
    return;
  }
  if (error instanceof StrategyTimeoutError) {
    response.status(504).json({ error: "Strategy execution timed out" });
    return;
  }
  response.status(500).json({ error: "Internal server error" });
}

export function createApp(options: ChatServerOptions = {}): Express {
  const strategies = options.strategies ?? strategyRegistry;
  const reflectionDecorator = options.reflectionDecorator ?? withReflection;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const conversationStore = options.conversationStore ??
    new SqliteConversationStore(":memory:");
  const chatService = createChatService(
    conversationStore,
    options.memoryStore,
    options.learningService,
    console,
    options.summarizer,
  );
  const app = express();

  app.use(express.json());
  app.post("/chat", async (request: Request, response: Response) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        issues: parsed.error.issues,
      });
      return;
    }

    if (!Object.hasOwn(strategies, parsed.data.strategy)) {
      response.status(422).json({
        error: "Unknown strategy",
        strategy: parsed.data.strategy,
      });
      return;
    }
    const registeredStrategy = strategies[parsed.data.strategy];

    try {
      const strategy = parsed.data.reflact
        ? reflectionDecorator(registeredStrategy)
        : registeredStrategy;
      const result = await chatService.runChat(
        {
          message: parsed.data.message,
          userId: parsed.data.userId,
          conversationId: parsed.data.conversationId,
        },
        {
          run: (input, strategyOptions) =>
            runWithTimeout(
              strategy.run(composeStrategyInput(input), strategyOptions),
              timeoutMs,
            ),
        },
      );
      response.status(200).json(chatResponseSchema.parse(result));
    } catch (error) {
      sendFailure(error, response);
    }
  });

  app.use((
    error: unknown,
    _request: Request,
    response: Response,
    next: (error?: unknown) => void,
  ) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (
      error instanceof SyntaxError &&
      "status" in error &&
      error.status === 400
    ) {
      response.status(400).json({ error: "Invalid JSON" });
      return;
    }
    response.status(500).json({ error: "Internal server error" });
  });

  return app;
}
