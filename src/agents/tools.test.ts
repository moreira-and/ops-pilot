import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperationalTools,
  listAlertsInputSchema,
  opsTools,
  openIncidentInputSchema,
} from "./tools.js";
import { InMemoryOperationalStore } from "../services/in-memory-operational-store.js";

test("list_alerts defaults to firing and supports all statuses", async () => {
  const store = new InMemoryOperationalStore({
    services: [{ id: "api", name: "API" }],
    alerts: [
      { id: "a1", serviceId: "api", title: "Down", status: "firing", severity: "critical" },
      { id: "a2", serviceId: "api", title: "Recovered", status: "resolved", severity: "low" },
    ],
  });
  const { listAlerts } = createOperationalTools(store);
  const defaultResult = JSON.parse(String(await listAlerts.invoke({}))) as { id: string }[];
  const allResult = JSON.parse(
    String(await listAlerts.invoke({ status: "all" })),
  ) as { id: string }[];

  assert.deepEqual(defaultResult.map(({ id }) => id), ["a1"]);
  assert.equal(allResult.length, 2);
});

test("open_incident and resolve_incident validate and persist their results", async () => {
  const store = new InMemoryOperationalStore({
    services: [{ id: "api", name: "API" }],
  });
  const { openIncident, resolveIncident } = createOperationalTools(store);
  const opened = JSON.parse(
    String(
      await openIncident.invoke({
        title: "Investigate",
        service: "api",
        severity: "high",
      }),
    ),
  ) as { id: string; status: string };

  assert.equal(opened.status, "open");
  const resolved = JSON.parse(
    String(await resolveIncident.invoke({ id: opened.id })),
  ) as { status: string };
  assert.equal(resolved.status, "resolved");
});

test("open_incident normalizes SEV aliases to canonical severities", async () => {
  const { openIncident } = createOperationalTools(
    new InMemoryOperationalStore({ services: [{ id: "api", name: "API" }] }),
  );
  const aliases = [
    ["sev1", "critical"],
    ["sev2", "high"],
    ["sev3", "medium"],
    ["sev4", "low"],
  ] as const;

  for (const [inputSeverity, expectedSeverity] of aliases) {
    const opened = JSON.parse(
      String(
        await openIncident.invoke({
          title: "Investigate",
          service: "api",
          severity: inputSeverity,
        }),
      ),
    ) as { severity: string };
    assert.equal(opened.severity, expectedSeverity);
  }
});

test("rejects invalid tool arguments", async () => {
  assert.equal(listAlertsInputSchema.safeParse({ status: "unknown" }).success, false);
  assert.equal(
    openIncidentInputSchema.safeParse({
      title: " ",
      service: "api",
      severity: "urgent",
    }).success,
    false,
  );
  const { openIncident } = createOperationalTools(
    new InMemoryOperationalStore({ services: [{ id: "api", name: "API" }] }),
  );
  await assert.rejects(openIncident.invoke({ title: "  ", service: "api", severity: "low" }));
});

test("default model tools read the JSON demo seed in memory", async () => {
  const alerts = JSON.parse(String(await opsTools.listAlerts.invoke({ status: "all" }))) as {
    serviceId: string;
    status: string;
  }[];
  assert.equal(alerts.length, 7);
  assert.equal(alerts.filter(({ status }) => status === "firing").length, 4);
  assert.equal(alerts.filter(({ status }) => status === "resolved").length, 3);
  assert.ok(alerts.some(({ serviceId, status }) => serviceId === "catalog" && status === "firing"));

  const catalogIncident = JSON.parse(
    String(
      await opsTools.openIncident.invoke({
        title: "Catalog alert incident",
        service: "catalog",
        severity: "sev2",
      }),
    ),
  ) as { serviceName: string; severity: string };
  assert.equal(catalogIncident.serviceName, "Catalog");
  assert.equal(catalogIncident.severity, "high");
});
