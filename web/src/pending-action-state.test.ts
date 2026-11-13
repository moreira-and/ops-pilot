import assert from "node:assert/strict";
import test from "node:test";
import {
  canDecide,
  initialPendingActionState,
  pendingActionReducer,
} from "./pending-action-state.js";
import type {
  ClientPendingAction,
  PendingAction,
} from "../../src/contracts/war-room.js";

const pending: PendingAction = {
  id: "b81ef9a6-9465-43ad-85a8-19b4d13c6a5e",
  requestId: "c1d9a7f1-a944-4ace-b7d8-6ab7f7c947b1",
  kind: "open_incident",
  summary: "Open an incident for checkout",
  details: {
    title: "Checkout unavailable",
    service: "checkout",
    severity: "high",
  },
  status: "pending",
};

test("adds every pending action and permits decisions only while pending", () => {
  const state = pendingActionReducer(initialPendingActionState, {
    type: "received",
    actions: [pending, { ...pending, id: "e61f69c4-e78f-43ea-aef3-10991ee90d6f" }],
  });

  assert.equal(state.actions.length, 2);
  assert.equal(canDecide(state.actions[0]!), true);
  assert.equal(
    canDecide({ ...state.actions[0]!, isDeciding: true }),
    false,
  );
  for (const status of [
    "processing",
    "failed",
    "reconciliation_required",
    "approved",
    "denied",
  ] as const) {
    assert.equal(
      canDecide({
        ...state.actions[0]!,
        action: { ...pending, status },
      }),
      false,
    );
  }
});

test("restores active actions and removes actions no longer returned by the API", () => {
  const processing: PendingAction = {
    ...pending,
    id: "e61f69c4-e78f-43ea-aef3-10991ee90d6f",
    status: "processing",
  };
  const restored = pendingActionReducer(initialPendingActionState, {
    type: "restored",
    actions: [pending, processing],
  });
  assert.equal(restored.actions.length, 2);
  assert.equal(canDecide(restored.actions[1]!), false);

  const refreshed = pendingActionReducer(restored, {
    type: "restored",
    actions: [processing],
  });
  assert.deepEqual(refreshed.actions.map(({ action }) => action.id), [processing.id]);
});

test("keeps an incomplete pending action visible without enabling a decision", () => {
  const incomplete: ClientPendingAction = {
    requestId: pending.requestId,
    kind: "open_incident",
    status: "pending",
  };
  const state = pendingActionReducer(initialPendingActionState, {
    type: "received",
    actions: [incomplete],
  });

  assert.equal(state.actions.length, 1);
  assert.equal(canDecide(state.actions[0]!), false);
});

test("keeps a failed decision pending and marks a confirmed decision terminal", () => {
  const received = pendingActionReducer(initialPendingActionState, {
    type: "received",
    actions: [pending],
  });
  const deciding = pendingActionReducer(received, {
    type: "decisionStarted",
    id: pending.id,
  });
  assert.equal(canDecide(deciding.actions[0]!), false);

  const failed = pendingActionReducer(deciding, {
    type: "decisionFailed",
    id: pending.id,
    error: "The decision was not confirmed.",
  });
  assert.equal(failed.actions[0]?.action.status, "pending");
  assert.equal(failed.actions[0]?.error, "The decision was not confirmed.");
  assert.equal(canDecide(failed.actions[0]!), true);

  const approved = pendingActionReducer(failed, {
    type: "decisionSucceeded",
    decision: {
      id: pending.id,
      status: "approved",
      result: {
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
      },
    },
  });
  assert.equal(approved.actions[0]?.action.status, "approved");
  assert.equal(canDecide(approved.actions[0]!), false);
});
