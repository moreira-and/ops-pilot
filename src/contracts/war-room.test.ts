import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  actionDecisionRequestSchema,
  actionDecisionResponseSchema,
  actionListResponseSchema,
  chatAcceptedResponseSchema,
  chatResponseSchema,
  pendingActionSchema,
} from "./war-room.js";

const requestId = randomUUID();
const conversationId = "conversation-1";
const actionId = randomUUID();

const chatResult = {
  requestId,
  conversationId,
  answer: "A proposal needs your review.",
  trace: [
    { sequence: 0, type: "answer", node: "answer", content: "Review it." },
  ],
  metrics: {
    llmCalls: 1,
    latencyMs: 12,
    historyMessages: 0,
    contextBreakdown: {
      system: 0,
      summary: 0,
      history: 0,
      memories: 0,
      message: 0,
    },
  },
};

const pendingAction = {
  id: actionId,
  requestId,
  kind: "open_incident",
  summary: "Open an incident for checkout",
  details: {
    title: "Checkout unavailable",
    service: "checkout",
    severity: "high",
  },
  status: "pending",
};

test("validates the existing chat response and its typed trace", () => {
  assert.deepEqual(chatResponseSchema.parse(chatResult), chatResult);
  assert.equal(
    chatResponseSchema.safeParse({
      ...chatResult,
      trace: [{ sequence: 0, type: "unknown", node: "test" }],
    }).success,
    false,
  );
});

test("validates 202 chat responses and rejects incomplete or unsafe actions", () => {
  assert.deepEqual(
    chatAcceptedResponseSchema.parse({
      ...chatResult,
      pendingActions: [pendingAction],
    }).pendingActions,
    [pendingAction],
  );
  assert.equal(
    chatAcceptedResponseSchema.safeParse({
      ...chatResult,
      pendingActions: [{ ...pendingAction, id: "not-a-uuid" }],
    }).success,
    false,
  );
  assert.equal(
    pendingActionSchema.safeParse({
      ...pendingAction,
      kind: "arbitrary_command",
    }).success,
    false,
  );
});

test("validates active action lists and explicit approve/deny decisions", () => {
  assert.deepEqual(
    actionListResponseSchema.parse({ actions: [pendingAction] }).actions,
    [pendingAction],
  );
  assert.deepEqual(
    actionListResponseSchema.parse({ actions: [] }),
    { actions: [] },
  );
  assert.deepEqual(
    actionDecisionRequestSchema.parse({
      userId: randomUUID(),
      decision: "approve",
    }).decision,
    "approve",
  );
  assert.equal(
    actionDecisionRequestSchema.safeParse({
      userId: "operator",
      decision: "maybe",
    }).success,
    false,
  );
});

test("validates terminal decision results from the API", () => {
  const result = {
    id: "incident-1",
    title: "Checkout unavailable",
    serviceId: "checkout",
    serviceName: "Checkout",
    severity: "high",
    status: "open",
    summary: null,
    createdAt: "2026-11-13T00:00:00.000Z",
    updatedAt: "2026-11-13T00:00:00.000Z",
    resolvedAt: null,
  };
  assert.equal(
    actionDecisionResponseSchema.parse({
      id: actionId,
      status: "approved",
      result,
    }).status,
    "approved",
  );
  assert.equal(
    actionDecisionResponseSchema.safeParse({
      id: actionId,
      status: "denied",
      result,
    }).success,
    false,
  );
});
