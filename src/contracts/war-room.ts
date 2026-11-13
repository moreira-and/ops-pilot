import { z } from "zod";
import {
  reasoningMetricsSchema,
  reasoningResultSchema,
  severitySchema,
} from "../agents/reasoning.js";

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  strategy: z.string().trim().min(1).optional(),
  reflact: z.boolean().default(false),
  conversationId: z.string().trim().min(1).optional(),
});

export const chatResponseSchema = reasoningResultSchema.extend({
  requestId: z.string().uuid(),
  conversationId: z.string().trim().min(1),
  metrics: reasoningMetricsSchema.extend({
    historyMessages: z.number().int().min(0).max(8),
    contextBreakdown: z.object({
      system: z.number().int().nonnegative(),
      summary: z.number().int().nonnegative(),
      history: z.number().int().nonnegative(),
      memories: z.number().int().nonnegative(),
      message: z.number().int().nonnegative(),
    }),
  }),
});

export const pendingActionKindSchema = z.enum([
  "open_incident",
  "resolve_incident",
]);

export const pendingActionStatusSchema = z.enum([
  "pending",
  "processing",
  "approved",
  "denied",
  "failed",
  "reconciliation_required",
]);

const pendingActionBaseShape = {
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  summary: z.string().trim().min(1),
  status: pendingActionStatusSchema,
};

const openIncidentDetailsSchema = z.object({
  title: z.string().trim().min(1),
  service: z.string().trim().min(1),
  severity: severitySchema,
}).strict();

const resolveIncidentDetailsSchema = z.object({
  id: z.string().trim().min(1),
}).strict();

export const pendingActionSchema = z.discriminatedUnion("kind", [
  z.object({
    ...pendingActionBaseShape,
    kind: z.literal("open_incident"),
    details: openIncidentDetailsSchema,
  }).strict(),
  z.object({
    ...pendingActionBaseShape,
    kind: z.literal("resolve_incident"),
    details: resolveIncidentDetailsSchema,
  }).strict(),
]);

export const chatAcceptedResponseSchema = chatResponseSchema.extend({
  pendingActions: z.array(pendingActionSchema).min(1),
});

const clientPendingActionFallbackSchema = z.object({
  id: z.string().uuid().optional().catch(undefined),
  requestId: z.string().uuid().optional().catch(undefined),
  kind: pendingActionKindSchema.optional().catch(undefined),
  summary: z.string().trim().min(1).optional().catch(undefined),
  status: pendingActionStatusSchema,
});

export const clientPendingActionSchema = z.union([
  pendingActionSchema,
  clientPendingActionFallbackSchema,
]);

export const clientChatAcceptedResponseSchema = chatResponseSchema.extend({
  pendingActions: z.array(clientPendingActionSchema).min(1),
});

export const actionListResponseSchema = z.object({
  actions: z.array(pendingActionSchema),
}).strict();

export const actionDecisionRequestSchema = z.object({
  userId: z.string().uuid(),
  decision: z.enum(["approve", "deny"]),
}).strict();

export const incidentDecisionResultSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  serviceName: z.string().trim().min(1),
  severity: severitySchema,
  status: z.enum(["open", "resolved"]),
  summary: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
}).strict();

export const actionDecisionResponseSchema = z.discriminatedUnion("status", [
  z.object({
    id: z.string().uuid(),
    status: z.literal("approved"),
    result: incidentDecisionResultSchema,
  }).strict(),
  z.object({
    id: z.string().uuid(),
    status: z.literal("denied"),
  }).strict(),
]);

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ChatAcceptedResponse = z.infer<typeof chatAcceptedResponseSchema>;
export type PendingAction = z.infer<typeof pendingActionSchema>;
export type ClientChatAcceptedResponse = z.infer<
  typeof clientChatAcceptedResponseSchema
>;
export type ClientPendingAction = z.infer<typeof clientPendingActionSchema>;
export type PendingActionKind = z.infer<typeof pendingActionKindSchema>;
export type PendingActionStatus = z.infer<typeof pendingActionStatusSchema>;
export type ActionDecisionRequest = z.infer<typeof actionDecisionRequestSchema>;
export type ActionDecisionResponse = z.infer<typeof actionDecisionResponseSchema>;
export type IncidentDecisionResult = z.infer<typeof incidentDecisionResultSchema>;
