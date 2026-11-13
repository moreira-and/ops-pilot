import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  actionDecisionRequestSchema,
  actionDecisionResponseSchema,
  incidentDecisionResultSchema,
  pendingActionSchema,
  type ActionDecisionResponse,
  type IncidentDecisionResult,
  type PendingAction,
} from "../contracts/war-room.js";
import { incidentRecordSchema, type IncidentRecord, type NewIncident } from "./operational-store.js";
import {
  PendingActionConflictError,
  PendingActionExecutionError,
  PendingActionNotFoundError,
} from "./domain-error.js";
import {
  pendingActionProposalSchema,
  pendingActionRecordSchema,
  type PendingActionRecord,
  type PendingActionStore,
} from "./pending-action-store.js";

const actionIdSchema = z.string().uuid();
const userIdSchema = z.string().uuid();

export interface PendingIncidentOperations {
  openIncident(input: NewIncident): Promise<IncidentRecord>;
  resolveIncident(id: string): Promise<IncidentRecord>;
}

export interface PendingActionService {
  propose(input: unknown): Promise<PendingAction>;
  listForUser(userId: unknown): PendingAction[];
  listForRequest(requestId: string, userId: string): PendingAction[];
  decide(id: unknown, input: unknown): Promise<ActionDecisionResponse>;
}

export interface PendingActionServiceOptions {
  idGenerator?: () => string;
  now?: () => Date;
}

function publicAction(record: PendingActionRecord): PendingAction {
  return pendingActionSchema.parse({
    id: record.id,
    requestId: record.requestId,
    kind: record.kind,
    summary: record.summary,
    details: record.details,
    status: record.status,
  });
}

function publicIncidentResult(recordInput: unknown): IncidentDecisionResult {
  const record = incidentRecordSchema.parse(recordInput);
  return incidentDecisionResultSchema.parse({
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
  });
}

function terminalResponse(
  action: PendingActionRecord,
  decision: "approve" | "deny",
): ActionDecisionResponse {
  if (action.status === "approved" && decision === "approve" && action.result) {
    return actionDecisionResponseSchema.parse({
      id: action.id,
      status: "approved",
      result: action.result,
    });
  }
  if (action.status === "denied" && decision === "deny") {
    return actionDecisionResponseSchema.parse({
      id: action.id,
      status: "denied",
    });
  }
  throw new PendingActionConflictError();
}

function assertActionState(
  action: PendingActionRecord,
): PendingActionRecord {
  return pendingActionRecordSchema.parse(action);
}

export function createPendingActionService(
  store: PendingActionStore,
  operations: PendingIncidentOperations,
  options: PendingActionServiceOptions = {},
): PendingActionService {
  const idGenerator = options.idGenerator ?? randomUUID;
  const now = options.now ?? (() => new Date());

  function getActionForDecision(id: string, userId: string): PendingActionRecord {
    const action = store.getForUser(id, userId);
    if (!action) throw new PendingActionNotFoundError();
    return assertActionState(action);
  }

  function returnIfRepeatedDecision(
    action: PendingActionRecord,
    decision: "approve" | "deny",
  ): ActionDecisionResponse | null {
    if (action.status === "approved" || action.status === "denied") {
      return terminalResponse(action, decision);
    }
    if (action.status !== "pending") throw new PendingActionConflictError();
    return null;
  }

  return {
    async propose(input) {
      const proposal = pendingActionProposalSchema.parse(input);
      const createdAt = now().toISOString();
      const id = actionIdSchema.parse(idGenerator());
      const common = {
        id,
        requestId: proposal.requestId,
        userId: proposal.userId,
        status: "pending" as const,
        createdAt,
        decidedAt: null,
        result: null,
        errorCode: null,
      };
      const record = proposal.kind === "open_incident"
        ? pendingActionRecordSchema.parse({
          ...common,
          kind: proposal.kind,
          summary: `Abrir incidente: ${proposal.input.title}`,
          details: {
            title: proposal.input.title,
            service: proposal.input.serviceId,
            severity: proposal.input.severity,
          },
          payload: { kind: proposal.kind, input: proposal.input },
        })
        : pendingActionRecordSchema.parse({
          ...common,
          kind: proposal.kind,
          summary: `Resolver incidente ${proposal.input.id}`,
          details: { id: proposal.input.id },
          payload: { kind: proposal.kind, input: proposal.input },
        });
      return publicAction(store.create(record));
    },

    listForUser(userIdInput) {
      const userId = userIdSchema.parse(userIdInput);
      return store.listForUser(userId).map((action) =>
        publicAction(assertActionState(action))
      );
    },

    listForRequest(requestIdInput, userIdInput) {
      const requestId = actionIdSchema.parse(requestIdInput);
      const userId = userIdSchema.parse(userIdInput);
      return store.listForRequest(requestId, userId).map((action) =>
        publicAction(assertActionState(action))
      );
    },

    async decide(idInput, decisionInput) {
      const id = actionIdSchema.parse(idInput);
      const decision = actionDecisionRequestSchema.parse(decisionInput);
      const action = getActionForDecision(id, decision.userId);
      const repeated = returnIfRepeatedDecision(action, decision.decision);
      if (repeated) return repeated;

      const decidedAt = now().toISOString();
      if (decision.decision === "deny") {
        const denied = store.denyPending(id, decision.userId, decidedAt);
        if (denied) {
          return actionDecisionResponseSchema.parse({
            id,
            status: "denied",
          });
        }
        return terminalResponse(
          getActionForDecision(id, decision.userId),
          decision.decision,
        );
      }

      const claimed = store.claimPending(id, decision.userId, decidedAt);
      if (!claimed) {
        return terminalResponse(
          getActionForDecision(id, decision.userId),
          decision.decision,
        );
      }

      let incident: IncidentRecord;
      try {
        incident = claimed.kind === "open_incident"
          ? await operations.openIncident(claimed.payload.input)
          : await operations.resolveIncident(claimed.payload.input.id);
        incident = incidentRecordSchema.parse(incident);
      } catch {
        store.failProcessing(
          id,
          "INCIDENT_OPERATION_FAILED",
          now().toISOString(),
        );
        throw new PendingActionExecutionError();
      }

      const result = publicIncidentResult(incident);
      const approved = store.completeApproved(id, result, now().toISOString());
      if (!approved) throw new PendingActionExecutionError();
      return actionDecisionResponseSchema.parse({
        id,
        status: "approved",
        result,
      });
    },
  };
}
