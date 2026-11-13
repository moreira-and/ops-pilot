import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  createPendingActionService,
} from "./pending-action-service.js";
import { SqlitePendingActionStore } from "../store/sqlite-pending-action-store.js";
import type { IncidentRecord } from "./operational-store.js";
import {
  PendingActionConflictError,
  PendingActionExecutionError,
} from "./domain-error.js";

const userId = "8bd40b90-b1c8-4ab0-82a9-27be74b85e36";
const requestId = "c1d9a7f1-a944-4ace-b7d8-6ab7f7c947b1";

function incident(overrides: Partial<IncidentRecord> = {}): IncidentRecord {
  const now = new Date("2026-11-13T00:01:00.000Z");
  return {
    id: "incident-1",
    title: "Checkout unavailable",
    serviceId: "checkout",
    serviceName: "Checkout",
    severity: "high",
    status: "open",
    summary: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    ...overrides,
  };
}

function createService(
  overrides: {
    openIncident?: (input: unknown) => Promise<IncidentRecord>;
    resolveIncident?: (id: string) => Promise<IncidentRecord>;
  } = {},
) {
  const store = new SqlitePendingActionStore(":memory:");
  let actionId = 0;
  const service = createPendingActionService(
    store,
    {
      openIncident: overrides.openIncident ??
        (async () => incident()),
      resolveIncident: overrides.resolveIncident ??
        (async () => incident({ status: "resolved" })),
    },
    {
      idGenerator: () => {
        actionId += 1;
        return actionId === 1
          ? "b81ef9a6-9465-43ad-85a8-19b4d13c6a5e"
          : randomUUID();
      },
      now: () => new Date("2026-11-13T00:00:00.000Z"),
    },
  );
  return { store, service };
}

test("proposes validated incident actions without executing a mutation", async (t) => {
  let openCalls = 0;
  const { store, service } = createService({
    openIncident: async () => {
      openCalls += 1;
      return incident();
    },
  });
  t.after(() => store.close());

  const proposed = await service.propose({
    requestId,
    userId,
    kind: "open_incident",
    input: {
      title: "Checkout unavailable",
      serviceId: "checkout",
      severity: "high",
    },
  });

  assert.equal(openCalls, 0);
  assert.equal(proposed.status, "pending");
  assert.equal(proposed.kind, "open_incident");
  assert.equal("payload" in proposed, false);
  assert.equal(store.getForUser(proposed.id, userId)?.status, "pending");
});

test("approves once, returns the terminal result for a retry, and denies without execution", async (t) => {
  let openCalls = 0;
  let resolveCalls = 0;
  const { store, service } = createService({
    openIncident: async () => {
      openCalls += 1;
      return incident();
    },
    resolveIncident: async () => {
      resolveCalls += 1;
      return incident({ status: "resolved" });
    },
  });
  t.after(() => store.close());

  const approval = await service.propose({
    requestId,
    userId,
    kind: "open_incident",
    input: {
      title: "Checkout unavailable",
      serviceId: "checkout",
      severity: "high",
    },
  });
  const approved = await service.decide(approval.id, {
    userId,
    decision: "approve",
  });
  const repeated = await service.decide(approval.id, {
    userId,
    decision: "approve",
  });
  assert.deepEqual(repeated, approved);
  assert.equal(approved.status, "approved");
  assert.equal(openCalls, 1);
  await assert.rejects(
    service.decide(approval.id, { userId, decision: "deny" }),
    PendingActionConflictError,
  );

  const denial = await service.propose({
    requestId,
    userId,
    kind: "resolve_incident",
    input: { id: "incident-1" },
  });
  const denied = await service.decide(denial.id, {
    userId,
    decision: "deny",
  });
  assert.equal(denied.status, "denied");
  assert.equal(resolveCalls, 0);
});

test("records operational failures and never returns a successful approval", async (t) => {
  const { store, service } = createService({
    openIncident: async () => {
      throw new Error("database detail must not be exposed");
    },
  });
  t.after(() => store.close());

  const proposed = await service.propose({
    requestId,
    userId,
    kind: "open_incident",
    input: {
      title: "Checkout unavailable",
      serviceId: "checkout",
      severity: "high",
    },
  });

  await assert.rejects(
    service.decide(proposed.id, { userId, decision: "approve" }),
    PendingActionExecutionError,
  );
  const stored = store.getForUser(proposed.id, userId);
  assert.equal(stored?.status, "failed");
  assert.equal(stored?.errorCode, "INCIDENT_OPERATION_FAILED");
  assert.equal(stored?.result, null);
});
