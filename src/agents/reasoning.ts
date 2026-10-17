import { z } from "zod";

export const reasoningInputSchema = z.string().trim().min(1);

export const reasoningOptionsSchema = z.object({
  maxIterations: z.number().int().safe().positive().default(8),
});

export const severitySchema = z.enum(["critical", "high", "medium", "low"]);
export const alertStatusSchema = z.enum(["firing", "resolved"]);
export const alertFilterSchema = z.enum(["firing", "resolved", "all"]);

const traceBaseSchema = z.object({
  sequence: z.number().int().nonnegative(),
});

export const traceEventSchema = z.discriminatedUnion("type", [
  traceBaseSchema.extend({ type: z.literal("thought"), content: z.string() }),
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
  traceBaseSchema.extend({ type: z.literal("critique"), content: z.string() }),
  traceBaseSchema.extend({ type: z.literal("answer"), content: z.string() }),
]);

export const reasoningMetricsSchema = z.object({
  llmCalls: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
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
