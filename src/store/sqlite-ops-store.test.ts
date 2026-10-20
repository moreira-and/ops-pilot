import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { EntityNotFoundError } from "../services/domain-error.js";
import { SqliteOpsStore } from "./sqlite-ops-store.js";

const services = [{ id: "checkout", name: "Checkout" }];

test("creates its schema in memory and implements incident lifecycle and filters", async () => {
  const store = new SqliteOpsStore(":memory:");
  try {
    await store.upsertDemoData({ services, alerts: [] });
    const opened = await store.openIncident({
      title: "Checkout latency",
      serviceId: "checkout",
      severity: "high",
    });

    assert.equal(opened.status, "open");
    assert.equal(opened.summary, null);
    assert.equal(opened.resolvedAt, null);
    assert.deepEqual((await store.listIncidents("open")).map(({ id }) => id), [opened.id]);
    assert.equal((await store.listIncidents("resolved")).length, 0);
    assert.equal((await store.listIncidents("all")).length, 1);

    const resolved = await store.resolveIncident(opened.id);
    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.resolvedAt instanceof Date);
    assert.deepEqual((await store.listIncidents("open")).length, 0);
    assert.deepEqual(
      (await store.listIncidents("resolved")).map(({ id }) => id),
      [opened.id],
    );
    assert.deepEqual(
      (await store.resolveIncident(opened.id)).resolvedAt,
      resolved.resolvedAt,
    );
  } finally {
    store.close();
  }
});

test("persists incidents when a file-backed database is reopened", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ops-pilot-sqlite-"));
  const path = join(directory, "nested", "ops.db");
  const first = new SqliteOpsStore(path);
  let incidentId = "";
  try {
    await first.upsertDemoData({ services, alerts: [] });
    incidentId = (await first.openIncident({
      title: "Payment service issue",
      serviceId: "checkout",
      severity: "critical",
    })).id;
  } finally {
    first.close();
  }

  try {
    const reopened = new SqliteOpsStore(path);
    try {
      const [incident] = await reopened.listIncidents("all");
      assert.equal(incident?.id, incidentId);
      assert.equal(incident?.title, "Payment service issue");
      assert.equal(incident?.status, "open");
      assert.equal(incident?.summary, null);
      assert.equal(incident?.resolvedAt, null);
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects unknown services and incidents", async () => {
  const store = new SqliteOpsStore(":memory:");
  try {
    await assert.rejects(
      store.openIncident({
        title: "Unknown service",
        serviceId: "missing",
        severity: "low",
      }),
      EntityNotFoundError,
    );
    await assert.rejects(store.resolveIncident("missing"), EntityNotFoundError);
  } finally {
    store.close();
  }
});

test("enforces closed status and severity values with database CHECK constraints", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ops-pilot-sqlite-check-"));
  const path = join(directory, "ops.db");
  const store = new SqliteOpsStore(path);
  const secondConnection = new DatabaseSync(path);
  try {
    await store.upsertDemoData({ services, alerts: [] });
    assert.throws(
      () =>
        secondConnection
          .prepare(
            "INSERT INTO alerts (id, service_id, title, status, severity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "bad-status",
            "checkout",
            "Invalid status",
            "silenced",
            "high",
            new Date().toISOString(),
            new Date().toISOString(),
          ),
      /CHECK constraint failed/,
    );
    assert.throws(
      () =>
        secondConnection
          .prepare(
            "INSERT INTO alerts (id, service_id, title, status, severity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "bad-severity",
            "checkout",
            "Invalid severity",
            "firing",
            "urgent",
            new Date().toISOString(),
            new Date().toISOString(),
          ),
      /CHECK constraint failed/,
    );
    for (const [id, status, severity] of [
      ["bad-incident-status", "mitigated", "high"],
      ["bad-incident-severity", "open", "urgent"],
    ]) {
      assert.throws(
        () =>
          secondConnection
            .prepare(
              "INSERT INTO incidents (id, title, service_id, severity, status, summary, created_at, updated_at, resolved_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL)",
            )
            .run(
              id,
              "Invalid incident",
              "checkout",
              severity,
              status,
              new Date().toISOString(),
              new Date().toISOString(),
            ),
        /CHECK constraint failed/,
      );
    }
  } finally {
    secondConnection.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
