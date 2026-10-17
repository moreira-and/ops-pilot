import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBenchmarkTable,
  parseBenchArgs,
  runBenchmark,
  type BenchStrategyFactory,
} from "./bench.js";
import type { ReasoningStrategy } from "./agents/reasoning.js";
import { DEMO_DATA } from "./scripts/demo-data.js";
import { InMemoryOperationalStore } from "./services/in-memory-operational-store.js";

test("parses defaults, a selected scenario, and the no-replanner flag", () => {
  assert.deepEqual(parseBenchArgs([]), {
    scenarios: ["C1", "C2", "C3"],
    noReplanner: false,
  });
  assert.deepEqual(
    parseBenchArgs(["--scenario", "C2", "--no-replanner"]),
    { scenarios: ["C2"], noReplanner: true },
  );
  assert.deepEqual(
    parseBenchArgs(["--scenario", "C1,C3"]),
    { scenarios: ["C1", "C3"], noReplanner: false },
  );
});

test("rejects invalid, duplicate, or repeated benchmark flags", () => {
  assert.throws(() => parseBenchArgs(["--scenario"]));
  assert.throws(() => parseBenchArgs(["--scenario", "C4"]));
  assert.throws(() => parseBenchArgs(["--scenario", "C1,C1"]));
  assert.throws(() => parseBenchArgs(["--scenario", "C1", "--scenario", "C2"]));
  assert.throws(() =>
    parseBenchArgs(["--no-replanner", "--no-replanner"]),
  );
  assert.throws(() => parseBenchArgs(["--unknown"]));
});

const testStrategyFactory: BenchStrategyFactory = (store) => {
  const runScenario = async (input: string) => {
    if (input.startsWith("Quantos alertas críticos")) {
      const alerts = await store.listAlerts("firing");
      const critical = alerts.filter(({ severity }) => severity === "critical");
      return String(critical.length);
    }

    if (input.startsWith("Abra três incidentes")) {
      const opened = [];
      for (const service of ["checkout", "payments", "catalog"]) {
        opened.push(
          await store.openIncident({
            title: `Benchmark ${service}`,
            serviceId: service,
            severity: "medium",
          }),
        );
      }
      await store.resolveIncident(opened[0]!.id);
      return "Created and resolved the incidents.";
    }

    const alerts = await store.listAlerts("firing");
    const oldest = [...alerts].sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id),
    )[0]!;
    await store.openIncident({
      title: oldest.title,
      serviceId: oldest.serviceId,
      severity: oldest.severity,
    });
    const openIncidents = await store.listIncidents();
    const addressedServices = new Set(
      openIncidents.map(({ serviceId }) => serviceId),
    );
    return String(
      alerts.filter(({ serviceId }) => !addressedServices.has(serviceId)).length,
    );
  };

  const strategy = (name: string): ReasoningStrategy => ({
    name,
    run: async (input) => ({
      answer: await runScenario(input),
      trace: [],
      metrics: { llmCalls: 3, latencyMs: 1 },
    }),
  });
  return {
    react: strategy("react"),
    "plan-and-execute": strategy("plan-and-execute"),
  };
};

test("runs all scenarios for both strategies and verifies resulting store state", async () => {
  const rows = await runBenchmark(
    parseBenchArgs(["--no-replanner"]),
    testStrategyFactory,
  );

  assert.equal(rows.length, 6);
  assert.deepEqual(
    rows.map(({ scenario, strategy }) => `${scenario}:${strategy}`),
    [
      "C1 Direto:react",
      "C1 Direto:plan-and-execute",
      "C2 Estruturado:react",
      "C2 Estruturado:plan-and-execute",
      "C3 Dinâmico:react",
      "C3 Dinâmico:plan-and-execute",
    ],
  );
  assert.ok(rows.every(({ accuracy }) => accuracy));
  assert.ok(rows.every(({ llCalls, latencyMs }) => llCalls === 3 && latencyMs === 1));
  assert.match(
    formatBenchmarkTable(rows),
    /^\| cenário\s+\| estratégia\s+\| acerto\s+\| llCalls\s+\| latencyMs\s+\|/,
  );
});

test("checks incident ordering, severity, and resolved state in the store", async () => {
  const rows = await runBenchmark(
    { scenarios: ["C2"], noReplanner: false },
    testStrategyFactory,
  );
  const store = new InMemoryOperationalStore(DEMO_DATA);
  const first = await store.openIncident({
    title: "checkout",
    serviceId: "checkout",
    severity: "medium",
  });
  await store.resolveIncident(first.id);
  await store.openIncident({
    title: "payments",
    serviceId: "payments",
    severity: "medium",
  });
  await store.openIncident({
    title: "catalog",
    serviceId: "catalog",
    severity: "medium",
  });

  assert.equal(rows.length, 2);
  assert.ok(rows.every(({ accuracy }) => accuracy));
  assert.deepEqual(
    (await store.listIncidents()).map(({ serviceId, severity, status }) => ({
      serviceId,
      severity,
      status,
    })),
    [
      { serviceId: "checkout", severity: "medium", status: "resolved" },
      { serviceId: "payments", severity: "medium", status: "open" },
      { serviceId: "catalog", severity: "medium", status: "open" },
    ],
  );
});
