import { z } from "zod";
import {
  incidentDecisionResultSchema,
  pendingActionKindSchema,
  pendingActionStatusSchema,
} from "../contracts/war-room.js";
import { newIncidentSchema } from "./operational-store.js";

const actionIdSchema = z.string().uuid();
const userIdSchema = z.string().uuid();
const requestIdSchema = z.string().uuid();
const resolveIncidentInputSchema = z.object({
  id: z.string().trim().min(1),
}).strict();

export const pendingActionProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    userId: userIdSchema,
    requestId: requestIdSchema,
    kind: z.literal("open_incident"),
    input: newIncidentSchema,
  }).strict(),
  z.object({
    userId: userIdSchema,
    requestId: requestIdSchema,
    kind: z.literal("resolve_incident"),
    input: resolveIncidentInputSchema,
  }).strict(),
]);

const openIncidentDetailsSchema = z.object({
  title: z.string().trim().min(1),
  service: z.string().trim().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
}).strict();
const resolveIncidentDetailsSchema = z.object({
  id: z.string().trim().min(1),
}).strict();

const pendingActionRecordBaseShape = {
  id: actionIdSchema,
  requestId: requestIdSchema,
  userId: userIdSchema,
  summary: z.string().trim().min(1),
  status: pendingActionStatusSchema,
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  result: incidentDecisionResultSchema.nullable(),
  errorCode: z.string().trim().min(1).nullable(),
};

const openIncidentRecordSchema = z.object({
  ...pendingActionRecordBaseShape,
  kind: z.literal("open_incident"),
  details: openIncidentDetailsSchema,
  payload: z.object({
    kind: z.literal("open_incident"),
    input: newIncidentSchema,
  }).strict(),
}).strict().superRefine((record, context) => {
  if (
    record.details.title !== record.payload.input.title ||
    record.details.service !== record.payload.input.serviceId ||
    record.details.severity !== record.payload.input.severity
  ) {
    context.addIssue({
      code: "custom",
      message: "Open incident details must match the validated payload.",
    });
  }
});

const resolveIncidentRecordSchema = z.object({
  ...pendingActionRecordBaseShape,
  kind: z.literal("resolve_incident"),
  details: resolveIncidentDetailsSchema,
  payload: z.object({
    kind: z.literal("resolve_incident"),
    input: resolveIncidentInputSchema,
  }).strict(),
}).strict().superRefine((record, context) => {
  if (record.details.id !== record.payload.input.id) {
    context.addIssue({
      code: "custom",
      message: "Resolve incident details must match the validated payload.",
    });
  }
});

export const pendingActionRecordSchema = z.discriminatedUnion("kind", [
  openIncidentRecordSchema,
  resolveIncidentRecordSchema,
]);

export type PendingActionProposal = z.infer<typeof pendingActionProposalSchema>;
export type PendingActionRecord = z.infer<typeof pendingActionRecordSchema>;
export type PendingActionKind = z.infer<typeof pendingActionKindSchema>;
export type PendingActionStatus = z.infer<typeof pendingActionStatusSchema>;

export interface PendingActionStore {
  create(input: unknown): PendingActionRecord;
  getForUser(id: string, userId: string): PendingActionRecord | null;
  listForUser(userId: string): PendingActionRecord[];
  listForRequest(requestId: string, userId: string): PendingActionRecord[];
  claimPending(
    id: string,
    userId: string,
    decidedAt: string,
  ): PendingActionRecord | null;
  denyPending(
    id: string,
    userId: string,
    decidedAt: string,
  ): PendingActionRecord | null;
  completeApproved(
    id: string,
    result: unknown,
    decidedAt: string,
  ): PendingActionRecord | null;
  failProcessing(
    id: string,
    errorCode: string,
    decidedAt: string,
  ): PendingActionRecord | null;
}
