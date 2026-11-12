import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  requestTraceCompletionSchema,
  requestTraceFailureSchema,
  requestTraceStartSchema,
  type RequestTraceCompletion,
  type RequestTraceFailure,
  type RequestTraceStore,
} from "./request-trace-store.js";
import { RequestNotFoundError } from "./domain-error.js";
import type { TraceEvent, ReasoningMetrics } from "../agents/reasoning.js";
import type { ProductionRoute } from "../agents/production-graph.js";
import { logger as defaultLogger, type StructuredLogger } from "../obs/logger.js";

const requestIdSchema = z.string().uuid();
const safeErrorCodeSchema = z.string().regex(/^[A-Z0-9_]+$/).max(64);

export const requestExecutionContextSchema = z.object({
  requestId: requestIdSchema,
  userId: z.string().trim().min(1),
  startedAt: z.date(),
});

export type RequestExecutionContext = z.infer<
  typeof requestExecutionContextSchema
>;

export interface RequestTraceCompletionInput {
  route: ProductionRoute;
  metrics: ReasoningMetrics;
  trace: readonly TraceEvent[];
}

export interface RequestTraceService {
  complete(
    context: RequestExecutionContext,
    input: RequestTraceCompletionInput,
  ): boolean;
}

export function createRequestTraceService(
  store: RequestTraceStore,
  logger: StructuredLogger = defaultLogger,
) {
  return {
    begin(userIdInput: string): RequestExecutionContext {
      const context = requestExecutionContextSchema.parse({
        requestId: randomUUID(),
        userId: userIdInput,
        startedAt: new Date(),
      });
      store.start(
        requestTraceStartSchema.parse({
          id: context.requestId,
          userId: context.userId,
          startedAt: context.startedAt,
        }),
      );
      logger.info({
        requestId: context.requestId,
        node: "solicitacao",
        type: "start",
      });
      return context;
    },

    complete(
      contextInput: RequestExecutionContext,
      input: RequestTraceCompletionInput,
    ): boolean {
      const context = requestExecutionContextSchema.parse(contextInput);
      const metrics = z.object({
        modelUsed: z.string().trim().min(1).optional(),
        promptTokens: z.number().int().nonnegative().optional(),
        completionTokens: z.number().int().nonnegative().optional(),
        latencyMs: z.number().nonnegative(),
      }).parse(input.metrics);
      const completion: RequestTraceCompletion = requestTraceCompletionSchema
        .parse({
          route: input.route,
          modelUsed: metrics.modelUsed ?? null,
          promptTokens: metrics.promptTokens ?? null,
          completionTokens: metrics.completionTokens ?? null,
          latencyMs: metrics.latencyMs,
          completedAt: new Date(),
        });
      const persisted = store.complete(
        context.requestId,
        completion,
        input.trace,
      );
      if (!persisted) {
        throw new Error("Request trace completion was not persisted.");
      }
      logger.info({
        requestId: context.requestId,
        node: "resposta",
        type: "done",
        route: input.route,
        ...(metrics.promptTokens === undefined
          ? {}
          : { tokens: metrics.promptTokens }),
        latencyMs: metrics.latencyMs,
        status: "ok",
      });
      return true;
    },

    fail(
      contextInput: RequestExecutionContext,
      errorCodeInput: string,
    ): void {
      const context = requestExecutionContextSchema.parse(contextInput);
      const failure: RequestTraceFailure = requestTraceFailureSchema.parse({
        completedAt: new Date(),
        errorCode: safeErrorCodeSchema.parse(errorCodeInput),
      });
      store.fail(context.requestId, failure);
      logger.error({
        requestId: context.requestId,
        node: "solicitacao",
        type: "failed",
        status: "failed",
        errorCode: failure.errorCode,
      });
    },

    get(requestIdInput: string) {
      const parsedId = requestIdSchema.safeParse(requestIdInput);
      if (!parsedId.success) {
        throw new RequestNotFoundError(requestIdInput);
      }
      const record = store.get(parsedId.data);
      if (!record) {
        throw new RequestNotFoundError(parsedId.data);
      }
      return record;
    },
  };
}
