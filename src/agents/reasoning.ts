import { z } from "zod";

export const reasoningInputSchema = z.string().trim().min(1);

export const reasoningOptionsSchema = z.object({
  maxIterations: z.number().int().safe().positive().default(8),
  userId: z.string().trim().min(1).optional(),
});

export const severitySchema = z.enum(["critical", "high", "medium", "low"]);
export const alertStatusSchema = z.enum(["firing", "resolved"]);
export const alertFilterSchema = z.enum(["firing", "resolved", "all"]);

const traceBaseSchema = z.object({
  sequence: z.number().int().nonnegative(),
  node: z.string().trim().min(1).default("strategy"),
});

export const traceEventSchema = z.union([
  traceBaseSchema.extend({ type: z.literal("thought"), content: z.string() }),
  traceBaseSchema.extend({
    type: z.literal("route"),
    route: z.enum(["react", "plan-and-execute", "reflect:react"]),
    reason: z.string().trim().min(1),
    source: z.enum(["router", "override"]),
  }),
  traceBaseSchema.extend({
    type: z.literal("action"),
    tool: z.string().min(1),
    toolCallId: z.string().optional(),
    args: z.record(z.string(), z.unknown()),
  }),
  traceBaseSchema.extend({
    type: z.literal("observation"),
    content: z.string(),
    tool: z.string().optional(),
    toolCallId: z.string().optional(),
    error: z.boolean().optional(),
  }),
  traceBaseSchema.extend({
    type: z.literal("plan"),
    content: z.string(),
    steps: z.array(
      z.object({
        id: z.string().min(1),
        description: z.string().min(1),
      }),
    ).max(8),
  }),
  z.union([
    traceBaseSchema.extend({
      type: z.literal("critique"),
      content: z.string(),
    }),
    traceBaseSchema.extend({
      type: z.literal("critique"),
      approved: z.boolean(),
      feedback: z.string(),
    }),
  ]),
  traceBaseSchema.extend({
    type: z.literal("summarize"),
    conversationId: z.string().min(1),
    messagesSummarized: z.number().int().positive(),
    summarizedThrough: z.number().int().positive(),
  }),
  traceBaseSchema.extend({
    type: z.literal("fallback"),
    from: z.string().min(1),
    to: z.string().min(1),
    reason: z.string().min(1),
  }),
  traceBaseSchema.extend({ type: z.literal("answer"), content: z.string() }),
]);

export const reasoningMetricsSchema = z.object({
  llmCalls: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  promptTokens: z.number().int().nonnegative().optional(),
  modelUsed: z.string().min(1).optional(),
});

export const reasoningResultSchema = z.object({
  answer: z.string().min(1),
  trace: z.array(traceEventSchema),
  metrics: reasoningMetricsSchema,
});

export type TraceEvent = z.infer<typeof traceEventSchema>;
export type ReasoningMetrics = z.infer<typeof reasoningMetricsSchema>;
export type ReasoningResult = z.infer<typeof reasoningResultSchema>;
export type ReasoningOptions = z.input<typeof reasoningOptionsSchema>;

export interface ReasoningStrategy {
  readonly name: string;
  run(input: string, options?: ReasoningOptions): Promise<ReasoningResult>;
}
