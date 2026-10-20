import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_DATA } from "../scripts/demo-data.js";
import { DEMO_RUNBOOKS } from "../scripts/demo-runbooks.js";
import { SqliteOpsStore } from "./sqlite-ops-store.js";

test("seeds five services, six alerts, and three runbooks idempotently", async () => {
  const store = new SqliteOpsStore(":memory:");
  try {
    await store.upsertDemoData(DEMO_DATA, DEMO_RUNBOOKS);
    const incident = await store.openIncident({
      title: "Operator-created incident",
      serviceId: "checkout",
      severity: "high",
    });
    await store.upsertDemoData(DEMO_DATA, DEMO_RUNBOOKS);

    const alerts = await store.listAlerts("all");
    assert.equal(DEMO_DATA.services.length, 5);
    assert.deepEqual(
      await Promise.all(
        DEMO_DATA.services.map(({ id }) => store.hasService(id)),
      ),
      [true, true, true, true, true],
    );
    assert.equal(await store.hasService("inventory"), false);
    assert.equal(await store.hasService("notifications"), false);
    assert.equal(alerts.length, 6);
    assert.equal(alerts.filter(({ status }) => status === "firing").length, 3);
    assert.equal(alerts.filter(({ status }) => status === "resolved").length, 3);
    assert.equal((await store.listIncidents("all")).length, 1);
    assert.ok((await store.listIncidents("all")).some(({ id }) => id === incident.id));
    assert.deepEqual(
      await Promise.all(
        ["checkout", "payments", "auth"].map((serviceId) => store.getRunbook(serviceId)),
      ).then((items) => items.map((runbook) => runbook?.serviceId)),
      ["checkout", "payments", "auth"],
    );
  } finally {
    store.close();
  }
});

test("separate in-memory stores do not share operational changes", async () => {
  const first = new SqliteOpsStore(":memory:");
  const second = new SqliteOpsStore(":memory:");
  try {
    await first.upsertDemoData(DEMO_DATA, DEMO_RUNBOOKS);
    await second.upsertDemoData(DEMO_DATA, DEMO_RUNBOOKS);
    await first.openIncident({
      title: "Isolated change",
      serviceId: "checkout",
      severity: "medium",
    });

    assert.equal((await first.listIncidents("all")).length, 1);
    assert.equal((await second.listIncidents("all")).length, 0);
  } finally {
    first.close();
    second.close();
  }
});
