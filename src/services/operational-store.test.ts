import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryOperationalStore } from "./in-memory-operational-store.js";
import { EntityNotFoundError } from "./domain-error.js";

const services = [{ id: "api", name: "API" }];
const alerts = [
  {
    id: "alert-1",
    serviceId: "api",
    title: "High latency",
    status: "firing" as const,
    severity: "high" as const,
  },
  {
    id: "alert-2",
    serviceId: "api",
    title: "Recovered",
    status: "resolved" as const,
    severity: "low" as const,
  },
];

test("filters firing, resolved, and all alerts deterministically", async () => {
  const store = new InMemoryOperationalStore({ services, alerts });

  assert.deepEqual(
    (await store.listAlerts("firing")).map((alert) => alert.id),
    ["alert-1"],
  );
  assert.deepEqual(
    (await store.listAlerts("resolved")).map((alert) => alert.id),
    ["alert-2"],
  );
  assert.equal((await store.listAlerts("all")).length, 2);
});

test("opens and resolves incidents with valid services", async () => {
  const store = new InMemoryOperationalStore({ services });
  const incident = await store.openIncident({
    title: "Investigate latency",
    serviceId: "api",
    severity: "high",
  });
  assert.equal(incident.status, "open");
  assert.equal((await store.resolveIncident(incident.id)).status, "resolved");
});

test("rejects unknown services and incidents without a success-shaped result", async () => {
  const store = new InMemoryOperationalStore();
  await assert.rejects(
    store.openIncident({ title: "Investigate", serviceId: "missing", severity: "low" }),
    EntityNotFoundError,
  );
  await assert.rejects(store.resolveIncident("missing"), EntityNotFoundError);
});

test("re-resolving an incident does not alter its resolved state or timestamp", async () => {
  const store = new InMemoryOperationalStore({ services });
  const created = await store.openIncident({
    title: "Investigate",
    serviceId: "api",
    severity: "medium",
  });
  const resolved = await store.resolveIncident(created.id);
  const repeated = await store.resolveIncident(created.id);
  assert.equal(repeated.status, "resolved");
  assert.equal(repeated.resolvedAt?.getTime(), resolved.resolvedAt?.getTime());
});
