import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SqlitePendingActionStore } from "./sqlite-pending-action-store.js";

const userId = "8bd40b90-b1c8-4ab0-82a9-27be74b85e36";

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    requestId: randomUUID(),
    userId,
    kind: "open_incident",
    summary: "Open an incident for checkout",
    details: {
      title: "Checkout unavailable",
      service: "checkout",
      severity: "high",
    },
    payload: {
      kind: "open_incident",
      input: {
        title: "Checkout unavailable",
        serviceId: "checkout",
        severity: "high",
      },
    },
    status: "pending",
    createdAt: "2026-11-13T00:00:00.000Z",
    decidedAt: null,
    result: null,
    errorCode: null,
    ...overrides,
  };
}

test("persists actions and scopes active listings to the browser ID", () => {
  const store = new SqlitePendingActionStore(":memory:");
  const action = record();
  try {
    store.create(action);
    assert.deepEqual(store.getForUser(action.id, userId), action);
    assert.deepEqual(store.listForUser(userId), [action]);
    assert.equal(
      store.getForUser(action.id, "b217b026-6c8c-4c70-9b41-8de1584a5a95"),
      null,
    );
    assert.deepEqual(
      store.listForUser("b217b026-6c8c-4c70-9b41-8de1584a5a95"),
      [],
    );
  } finally {
    store.close();
  }
});

test("rejects invalid closed values and only claims a pending action once", () => {
  const store = new SqlitePendingActionStore(":memory:");
  const action = record();
  try {
    assert.throws(() =>
      store.create({ ...action, status: "arbitrary" })
    );

    store.create(action);
    const claimed = store.claimPending(
      action.id,
      userId,
      "2026-11-13T00:01:00.000Z",
    );
    assert.equal(claimed?.status, "processing");
    assert.equal(
      store.claimPending(action.id, userId, "2026-11-13T00:02:00.000Z"),
      null,
    );
  } finally {
    store.close();
  }
});

test("denies only pending actions and removes them from the active listing", () => {
  const store = new SqlitePendingActionStore(":memory:");
  const action = record();
  try {
    store.create(action);
    const denied = store.denyPending(
      action.id,
      userId,
      "2026-11-13T00:01:00.000Z",
    );
    assert.equal(denied?.status, "denied");
    assert.deepEqual(store.listForUser(userId), []);
    assert.equal(
      store.denyPending(action.id, userId, "2026-11-13T00:02:00.000Z"),
      null,
    );
  } finally {
    store.close();
  }
});

test("marks persisted processing actions for reconciliation on restart", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "opspilot-pending-"));
  const path = join(directory, "actions.sqlite");
  let firstStore: SqlitePendingActionStore | undefined =
    new SqlitePendingActionStore(path);
  let reopenedStore: SqlitePendingActionStore | undefined;
  t.after(() => {
    firstStore?.close();
    reopenedStore?.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const action = record({
    status: "processing",
    decidedAt: "2026-11-13T00:01:00.000Z",
  });
  firstStore.create(action);
  firstStore.close();
  firstStore = undefined;

  reopenedStore = new SqlitePendingActionStore(path);
  assert.equal(
    reopenedStore.getForUser(action.id, userId)?.status,
    "reconciliation_required",
  );
  assert.equal(reopenedStore.listForUser(userId).length, 1);
});
