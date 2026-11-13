import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { strategyRegistry } from "../agents/index.js";
import { ModelUnavailableError } from "../agents/model.js";
import { withReflection } from "../agents/reflection.js";
import {
  createProductionGraph,
  productionRouteSchema,
  type ProductionGraphDependencies,
} from "../agents/production-graph.js";
import {
  contextBudgetSchema,
  parseContextBudget,
  type ContextBudget,
} from "../context/context-builder.js";
import {
  type ReasoningStrategy,
} from "../agents/reasoning.js";
import {
  actionDecisionRequestSchema,
  actionDecisionResponseSchema,
  actionListResponseSchema,
  chatAcceptedResponseSchema,
  chatRequestSchema,
  chatResponseSchema,
} from "../contracts/war-room.js";
import {
  ChatStrategyFailedError,
  composeStrategyInput,
  createChatService,
  type ChatLearningService,
  type MemoryRecallStore,
} from "../services/chat-service.js";
import type { PendingActionService } from "../services/pending-action-service.js";
import type { ConversationStore } from "../services/conversation-store.js";
import {
  ConversationNotFoundError,
  PendingActionConflictError,
  PendingActionExecutionError,
  PendingActionNotFoundError,
  RequestNotFoundError,
} from "../services/domain-error.js";
import {
  createRequestStatusService,
  requestStatusQuerySchema,
  requestStatusResponseSchema,
} from "../services/request-status-service.js";
import {
  LOCAL_MODEL_PRICES,
  type ModelPrice,
} from "../services/model-pricing.js";
import { createRequestTraceService } from "../services/request-trace-service.js";
import {
  requestTraceRecordSchema,
  type RequestTraceStore,
} from "../services/request-trace-store.js";
import type { Summarizer } from "../services/summarizer.js";
import type { StructuredLogger } from "../obs/logger.js";
import { SqliteConversationStore } from "../store/sqlite-conversation-store.js";
import { SqliteRequestTraceStore } from "../store/sqlite-request-trace-store.js";

const DEFAULT_TIMEOUT_MS = 180_000;

const corsOriginSchema = z.string().trim().url().refine((value) => {
  const parsed = new URL(value);
  return (
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.pathname === "/" &&
    parsed.search === "" &&
    parsed.hash === "" &&
    !value.includes("?") &&
    !value.includes("#")
  );
}, "CORS_ORIGIN must be an exact HTTP(S) origin without credentials or a path.");

export interface ChatServerOptions {
  strategies?: Record<string, ReasoningStrategy>;
  route?: ProductionGraphDependencies["route"];
  reflectionDecorator?: (strategy: ReasoningStrategy) => ReasoningStrategy;
  contextBudget?: ContextBudget;
  env?: Partial<Pick<NodeJS.ProcessEnv, "CONTEXT_BUDGET" | "CORS_ORIGIN">>;
  corsOrigin?: string;
  conversationStore?: ConversationStore;
  requestTraceStore?: RequestTraceStore;
  requestTraceService?: ReturnType<typeof createRequestTraceService>;
  modelPrices?: readonly ModelPrice[];
  logger?: StructuredLogger;
  memoryStore?: MemoryRecallStore;
  learningService?: ChatLearningService;
  pendingActionService?: PendingActionService;
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
  requestId?: string,
): void {
  const send = (status: number, body: Record<string, unknown>) => {
    response.status(status).json(
      requestId ? { ...body, requestId } : body,
    );
  };
  if (error instanceof ConversationNotFoundError) {
    send(404, { error: "Conversation not found" });
    return;
  }
  if (error instanceof RequestNotFoundError) {
    send(404, { error: "Request not found" });
    return;
  }
  if (error instanceof PendingActionNotFoundError) {
    send(404, { error: "Pending action not found" });
    return;
  }
  if (error instanceof PendingActionConflictError) {
    send(409, { error: "Pending action cannot accept this decision" });
    return;
  }
  if (error instanceof PendingActionExecutionError) {
    send(500, { error: "Approved action failed" });
    return;
  }
  if (error instanceof ChatStrategyFailedError) {
    send(500, { error: "Internal server error" });
    return;
  }
  if (error instanceof ModelUnavailableError) {
    send(503, { error: "Model unavailable" });
    return;
  }
  if (error instanceof StrategyTimeoutError) {
    send(504, { error: "Strategy execution timed out" });
    return;
  }
  send(500, { error: "Internal server error" });
}

export function createApp(options: ChatServerOptions = {}): Express {
  const rawCorsOrigin = options.corsOrigin ??
    (options.env === undefined ? process.env.CORS_ORIGIN : options.env.CORS_ORIGIN);
  const corsOrigin = rawCorsOrigin === undefined || rawCorsOrigin.trim() === ""
    ? undefined
    : new URL(corsOriginSchema.parse(rawCorsOrigin)).origin;
  const rawContextBudget = options.env === undefined
    ? process.env.CONTEXT_BUDGET
    : options.env.CONTEXT_BUDGET;
  const contextBudget = options.contextBudget === undefined
    ? parseContextBudget(rawContextBudget)
    : contextBudgetSchema.parse(options.contextBudget);
  const requestTraceStore = options.requestTraceStore ??
    new SqliteRequestTraceStore(":memory:");
  const requestTraceService = options.requestTraceService ??
    createRequestTraceService(requestTraceStore, options.logger);
  const requestStatusService = createRequestStatusService(
    requestTraceStore,
    options.modelPrices ?? LOCAL_MODEL_PRICES,
  );
  const strategies = options.strategies ?? strategyRegistry;
  const reflectionDecorator = options.reflectionDecorator ?? withReflection;
  const productionGraph = createProductionGraph({
    strategies,
    route: options.route,
    reflectionDecorator,
    requestTraceService,
  });
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const conversationStore = options.conversationStore ??
    new SqliteConversationStore(":memory:");
  const chatService = createChatService(
    conversationStore,
    options.memoryStore,
    options.learningService,
    console,
    options.summarizer,
    contextBudget,
  );
  const pendingActionService = options.pendingActionService;
  const app = express();

  app.use(cors({
    origin: (origin, callback) =>
      callback(
        null,
        corsOrigin !== undefined && origin === corsOrigin ? origin : false,
      ),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: false,
    optionsSuccessStatus: 204,
  }));
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
    if (
      pendingActionService &&
      !z.string().uuid().safeParse(parsed.data.userId).success
    ) {
      response.status(400).json({ error: "Invalid userId" });
      return;
    }

    if (
      parsed.data.strategy !== undefined &&
      !productionRouteSchema.safeParse(parsed.data.strategy).success
    ) {
      response.status(422).json({
        error: "Unknown strategy",
        strategy: parsed.data.strategy,
      });
      return;
    }

    let requestContext:
      | ReturnType<typeof requestTraceService.begin>
      | undefined;
    try {
      requestContext = requestTraceService.begin(parsed.data.userId);
      response.setHeader("X-Request-Id", requestContext.requestId);
      const result = await chatService.runChat(
        {
          message: parsed.data.message,
          userId: parsed.data.userId,
          conversationId: parsed.data.conversationId,
        },
        {
          run: (input, strategyOptions) =>
            runWithTimeout(
              productionGraph.run(
                composeStrategyInput(input, contextBudget),
                {
                  ...strategyOptions,
                  ...(requestContext
                    ? { requestId: requestContext.requestId }
                    : {}),
                },
                parsed.data.strategy,
                parsed.data.reflact,
                requestContext,
              ),
              timeoutMs,
            ),
        },
      );
      const responseBody = {
        ...result,
        requestId: requestContext.requestId,
      };
      const pendingActions = pendingActionService?.listForRequest(
        requestContext.requestId,
        parsed.data.userId,
      ) ?? [];
      if (pendingActions.length > 0) {
        response.status(202).json(chatAcceptedResponseSchema.parse({
          ...responseBody,
          pendingActions,
        }));
        return;
      }
      response.status(200).json(chatResponseSchema.parse(responseBody));
    } catch (error) {
      if (requestContext) {
        try {
          requestTraceService.fail(requestContext, failureCode(error));
        } catch (persistenceError) {
          sendFailure(persistenceError, response, requestContext.requestId);
          return;
        }
      }
      sendFailure(error, response, requestContext?.requestId);
    }
  });

  app.get("/actions", (request: Request, response: Response) => {
    const query = z.object({ userId: z.string().uuid() }).safeParse({
      userId: request.query.userId,
    });
    if (!query.success) {
      response.status(400).json({ error: "Invalid userId" });
      return;
    }
    if (!pendingActionService) {
      response.status(503).json({ error: "Approval actions unavailable" });
      return;
    }
    try {
      response.status(200).json(actionListResponseSchema.parse({
        actions: pendingActionService.listForUser(query.data.userId),
      }));
    } catch (error) {
      sendFailure(error, response);
    }
  });

  app.post("/actions/:id/decision", async (request: Request, response: Response) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const decision = actionDecisionRequestSchema.safeParse(request.body);
    if (!id.success || !decision.success) {
      response.status(400).json({ error: "Invalid decision request" });
      return;
    }
    if (!pendingActionService) {
      response.status(503).json({ error: "Approval actions unavailable" });
      return;
    }
    try {
      const result = await pendingActionService.decide(id.data, decision.data);
      response.status(200).json(actionDecisionResponseSchema.parse(result));
    } catch (error) {
      sendFailure(error, response);
    }
  });

  app.get("/requests/:id", (request: Request, response: Response) => {
    try {
      const requestId = request.params.id;
      if (typeof requestId !== "string") {
        throw new RequestNotFoundError("invalid");
      }
      response.status(200).json(
        requestTraceRecordSchema.parse(requestTraceService.get(requestId)),
      );
    } catch (error) {
      sendFailure(error, response);
    }
  });

  app.get("/status", (request: Request, response: Response) => {
    const query = requestStatusQuerySchema.safeParse({
      since: request.query.since,
    });
    if (!query.success) {
      response.status(400).json({ error: "Invalid since parameter" });
      return;
    }

    try {
      response.status(200).json(
        requestStatusResponseSchema.parse(
          requestStatusService.getStatus(query.data.since),
        ),
      );
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

function failureCode(error: unknown): string {
  if (error instanceof ModelUnavailableError) return "MODEL_UNAVAILABLE";
  if (error instanceof StrategyTimeoutError) return "STRATEGY_TIMEOUT";
  if (error instanceof ChatStrategyFailedError) return "CHAT_STRATEGY_FAILED";
  if (error instanceof ConversationNotFoundError) return "CONVERSATION_NOT_FOUND";
  return "REQUEST_FAILED";
}
