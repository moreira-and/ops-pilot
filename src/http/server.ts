import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { strategyRegistry } from "../agents/index.js";
import { withReflection } from "../agents/reflection.js";
import {
  reasoningResultSchema,
  type ReasoningStrategy,
} from "../agents/reasoning.js";

const chatRequestSchema = z.object({
  message: z.string().trim().min(1),
  strategy: z.string().trim().min(1).default("react"),
  reflact: z.boolean().default(false),
});

const DEFAULT_TIMEOUT_MS = 180_000;

export interface ChatServerOptions {
  strategies?: Record<string, ReasoningStrategy>;
  reflectionDecorator?: (strategy: ReasoningStrategy) => ReasoningStrategy;
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
      const result = await runWithTimeout(
        strategy.run(parsed.data.message),
        timeoutMs,
      );
      const validatedResult = reasoningResultSchema.parse(result);
      if (validatedResult.answer.startsWith("[FAILED]")) {
        response.status(500).json({ error: "Internal server error" });
        return;
      }
      response.status(200).json(validatedResult);
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
