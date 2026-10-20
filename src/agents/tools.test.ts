import assert from "node:assert/strict";
import test from "node:test";
import {
  consultarRunbookInputSchema,
  createOperationalTools,
  listAlertsInputSchema,
  listIncidentsInputSchema,
  openIncidentInputSchema,
} from "./tools.js";
import { runbookLookupResultSchema } from "../services/runbook-service.js";
import type { DemoData, RunbookRecord } from "../services/operational-store.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";

const data: DemoData = {
  services: [{ id: "api", name: "API" }, { id: "billing", name: "Billing" }],
  alerts: [
    { id: "a1", serviceId: "api", title: "Down", status: "firing", severity: "critical" },
    { id: "a2", serviceId: "api", title: "Recovered", status: "resolved", severity: "low" },
  ],
};

const runbooks: RunbookRecord[] = [
  {
    id: "api-runbook",
    serviceId: "api",
    title: "API recovery",
    instructions: "Check API health.",
  },
];

async function withTools(
  operation: (tools: ReturnType<typeof createOperationalTools>) => Promise<void>,
  seed = data,
  seedRunbooks = runbooks,
): Promise<void> {
  const store = new SqliteOpsStore(":memory:");
  try {
    await store.upsertDemoData(seed, seedRunbooks);
    await operation(createOperationalTools(store));
  } finally {
    store.close();
  }
}

test("list_alerts defaults to firing and supports every status", async () => {
  await withTools(async ({ listAlerts }) => {
    const defaultResult = JSON.parse(String(await listAlerts.invoke({}))) as { id: string }[];
    const resolved = JSON.parse(
      String(await listAlerts.invoke({ status: "resolved" })),
    ) as { id: string }[];
    const all = JSON.parse(
      String(await listAlerts.invoke({ status: "all" })),
    ) as { id: string }[];

    assert.deepEqual(defaultResult.map(({ id }) => id), ["a1"]);
    assert.deepEqual(resolved.map(({ id }) => id), ["a2"]);
    assert.equal(all.length, 2);
  });
});

test("open_incident and resolve_incident validate and return persisted results", async () => {
  await withTools(async ({ openIncident, resolveIncident }) => {
    const opened = JSON.parse(
      String(
        await openIncident.invoke({
          title: "Investigate",
          service: "api",
          severity: "high",
        }),
      ),
    ) as { id: string; status: string; summary: string | null };

    assert.equal(opened.status, "open");
    assert.equal(opened.summary, null);
    const resolved = JSON.parse(
      String(await resolveIncident.invoke({ id: opened.id })),
    ) as { status: string };
    assert.equal(resolved.status, "resolved");
  });
});

test("open_incident normalizes all SEV aliases to canonical severities", async () => {
  await withTools(async ({ openIncident }) => {
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
});

test("list_incidents filters open, resolved, and all; defaults to open", async () => {
  await withTools(async ({ listIncidents, openIncident, resolveIncident }) => {
    const open = JSON.parse(
      String(
        await openIncident.invoke({
          title: "Open incident",
          service: "api",
          severity: "high",
        }),
      ),
    ) as { id: string };
    const resolved = JSON.parse(
      String(
        await openIncident.invoke({
          title: "Resolved incident",
          service: "api",
          severity: "low",
        }),
      ),
    ) as { id: string };
    await resolveIncident.invoke({ id: resolved.id });

    const defaultResult = JSON.parse(
      String(await listIncidents.invoke({})),
    ) as { id: string }[];
    const resolvedResult = JSON.parse(
      String(await listIncidents.invoke({ status: "resolved" })),
    ) as { id: string }[];
    const all = JSON.parse(
      String(await listIncidents.invoke({ status: "all" })),
    ) as { id: string }[];

    assert.deepEqual(defaultResult.map(({ id }) => id), [open.id]);
    assert.deepEqual(resolvedResult.map(({ id }) => id), [resolved.id]);
    assert.equal(all.length, 2);
  });
});

test("consultar_runbook returns only a matching runbook and explicit unavailable outcomes", async () => {
  await withTools(async ({ consultarRunbook }) => {
    const available = runbookLookupResultSchema.parse(
      JSON.parse(String(await consultarRunbook.invoke({ service: "api" }))),
    );
    const unknown = runbookLookupResultSchema.parse(
      JSON.parse(String(await consultarRunbook.invoke({ service: "missing" }))),
    );
    const missing = runbookLookupResultSchema.parse(
      JSON.parse(String(await consultarRunbook.invoke({ service: "billing" }))),
    );

    assert.equal(available.available, true);
    if (available.available) assert.equal(available.runbook.serviceId, "api");
    assert.deepEqual(unknown, {
      available: false,
      service: "missing",
      reason: "unknown_service",
    });
    assert.deepEqual(missing, {
      available: false,
      service: "billing",
      reason: "runbook_unavailable",
    });
  });
});

test("rejects invalid arguments and annotates each tool field", async () => {
  assert.equal(listAlertsInputSchema.safeParse({ status: "unknown" }).success, false);
  assert.equal(listIncidentsInputSchema.safeParse({ status: "unknown" }).success, false);
  assert.equal(
    openIncidentInputSchema.safeParse({
      title: " ",
      service: "api",
      severity: "urgent",
    }).success,
    false,
  );
  assert.equal(
    consultarRunbookInputSchema.safeParse({ service: " " }).success,
    false,
  );

  await withTools(async (tools) => {
    for (const operationalTool of Object.values(tools)) {
      const schema = operationalTool.schema;
      assert.ok("shape" in schema);
      if ("shape" in schema) {
        for (const field of Object.values(schema.shape)) {
          assert.ok(field.description);
        }
      }
      const description = operationalTool.description.toLowerCase();
      assert.match(description, /use/);
      assert.match(description, /não/);
      assert.match(description, /falh|indisponibilidade/);
      assert.match(description, /não invente|não afirme/);
    }
  });
});
