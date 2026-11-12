import { z } from "zod";
import {
  productionRouteSchema,
  type ProductionRoute,
} from "../agents/production-graph.js";
import {
  traceEventSchema,
  type ReasoningMetrics,
  type TraceEvent,
} from "../agents/reasoning.js";

export const requestTraceStatusSchema = z.enum(["running", "ok", "failed"]);

export const requestRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().trim().min(1),
  route: productionRouteSchema.nullable(),
  modelUsed: z.string().trim().min(1).nullable(),
  promptTokens: z.number().int().nonnegative().nullable(),
  completionTokens: z.number().int().nonnegative().nullable(),
  latencyMs: z.number().nonnegative().nullable(),
  status: requestTraceStatusSchema,
  startedAt: z.date(),
  completedAt: z.date().nullable(),
  errorCode: z.string().trim().min(1).nullable(),
}).superRefine((request, context) => {
  if (request.status === "running" && request.completedAt !== null) {
    context.addIssue({
      code: "custom",
      path: ["completedAt"],
      message: "Running requests cannot have a completion time.",
    });
  }
  if (request.status !== "running" && request.completedAt === null) {
    context.addIssue({
      code: "custom",
      path: ["completedAt"],
      message: "Completed requests require a completion time.",
    });
  }
});

export const traceEventRecordSchema = z.object({
  requestId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  node: z.string().trim().min(1),
  type: z.string().trim().min(1),
  payload: traceEventSchema,
  createdAt: z.date(),
});

export const requestTraceRecordSchema = z.object({
  request: requestRecordSchema,
  trace: z.array(traceEventSchema),
});

export const requestStatusRecordSchema = z.object({
  id: z.string().uuid(),
  route: productionRouteSchema.nullable(),
  modelUsed: z.string().trim().min(1).nullable(),
  promptTokens: z.number().int().nonnegative().nullable(),
  completionTokens: z.number().int().nonnegative().nullable(),
  latencyMs: z.number().nonnegative().nullable(),
  status: requestTraceStatusSchema,
  startedAt: z.date(),
}).strict();

export const requestTraceStartSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().trim().min(1),
  startedAt: z.date(),
});

export const requestTraceCompletionSchema = z.object({
  route: productionRouteSchema,
  modelUsed: z.string().trim().min(1).nullable(),
  promptTokens: z.number().int().nonnegative().nullable(),
  completionTokens: z.number().int().nonnegative().nullable(),
  latencyMs: z.number().nonnegative(),
  completedAt: z.date(),
});

export const requestTraceFailureSchema = z.object({
  completedAt: z.date(),
  errorCode: z.string().trim().min(1),
});

export type RequestTraceStatus = z.infer<typeof requestTraceStatusSchema>;
export type RequestRecord = z.infer<typeof requestRecordSchema>;
export type TraceEventRecord = z.infer<typeof traceEventRecordSchema>;
export type RequestTraceRecord = z.infer<typeof requestTraceRecordSchema>;
export type RequestStatusRecord = z.infer<typeof requestStatusRecordSchema>;
export type RequestTraceStart = z.infer<typeof requestTraceStartSchema>;
export type RequestTraceCompletion = z.infer<
  typeof requestTraceCompletionSchema
>;
export type RequestTraceFailure = z.infer<typeof requestTraceFailureSchema>;
export type RequestTraceRoute = ProductionRoute;

export interface RequestTraceStore {
  start(input: RequestTraceStart): void;
  complete(
    requestId: string,
    input: RequestTraceCompletion,
    trace: readonly TraceEvent[],
  ): boolean;
  fail(requestId: string, input: RequestTraceFailure): void;
  get(requestId: string): RequestTraceRecord | null;
  listForStatus(from: Date, to: Date): RequestStatusRecord[];
  close(): void;
}

export type PersistedRequestMetrics = Pick<
  ReasoningMetrics,
  "modelUsed" | "promptTokens" | "completionTokens" | "latencyMs"
>;
