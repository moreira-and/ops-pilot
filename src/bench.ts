import { z } from "zod";
import { createPlanAndExecuteStrategy } from "./agents/plan-and-execute.js";
import { createReactStrategy } from "./agents/react.js";
import type { ReasoningStrategy } from "./agents/reasoning.js";
import {
  createOperationalTools,
  listAlertsInputSchema,
  listIncidentsInputSchema,
  consultarRunbookInputSchema,
  openIncidentInputSchema,
  resolveIncidentInputSchema,
} from "./agents/tools.js";
import { DEMO_DATA } from "./scripts/demo-data.js";
import { DEMO_RUNBOOKS } from "./scripts/demo-runbooks.js";
import { InMemoryOperationalStore } from "./services/in-memory-operational-store.js";

const scenarioIdSchema = z.enum(["C1", "C2", "C3"]);
const strategyNameSchema = z.enum(["react", "plan-and-execute"]);
const benchOptionsSchema = z.object({
  scenarios: z.array(scenarioIdSchema).min(1),
  noReplanner: z.boolean(),
});

export type ScenarioId = z.infer<typeof scenarioIdSchema>;
export type BenchOptions = z.infer<typeof benchOptionsSchema>;
export type BenchStrategyFactory = (
  store: InMemoryOperationalStore,
  noReplanner: boolean,
) => Record<z.infer<typeof strategyNameSchema>, ReasoningStrategy>;

interface Scenario {
  id: ScenarioId;
  title: string;
  input: string;
}

interface BenchRow {
  scenario: string;
  strategy: string;
  accuracy: boolean;
  llCalls: number;
  latencyMs: number;
}

const scenarios: Record<ScenarioId, Scenario> = {
  C1: {
    id: "C1",
    title: "Direto",
    input:
      "Quantos alertas críticos estão disparando? Consulte os alertas e responda somente com o número inteiro.",
  },
  C2: {
    id: "C2",
    title: "Estruturado",
    input:
      "Abra três incidentes de severidade sev2 para os serviços checkout, payments e catalog, nessa mesma ordem, com títulos que identifiquem cada serviço. Depois resolva o primeiro incidente criado. Execute todas as ações e responda brevemente.",
  },
  C3: {
    id: "C3",
    title: "Dinâmico",
    input:
      "Consulte os alertas disparando. Abra um incidente para o alerta mais antigo, usando o mesmo serviço e severidade desse alerta. Compare por createdAt; em caso de empate, escolha o menor id em ordem lexicográfica. Depois diga somente quantos alertas disparando continuam sem incidente aberto para seu serviço, como número inteiro.",
  },
};

type ToolInputs = {
  list_alerts: z.infer<typeof listAlertsInputSchema>;
  list_incidents: z.infer<typeof listIncidentsInputSchema>;
  consultar_runbook: z.infer<typeof consultarRunbookInputSchema>;
  open_incident: z.infer<typeof openIncidentInputSchema>;
  resolve_incident: z.infer<typeof resolveIncidentInputSchema>;
};

async function executeOperationalTool(
  tools: ReturnType<typeof createOperationalTools>,
  name: keyof ToolInputs,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "list_alerts":
      return String(
        await tools.listAlerts.invoke(listAlertsInputSchema.parse(input)),
      );
    case "list_incidents":
      return String(
        await tools.listIncidents.invoke(listIncidentsInputSchema.parse(input)),
      );
    case "consultar_runbook":
      return String(
        await tools.consultarRunbook.invoke(
          consultarRunbookInputSchema.parse(input),
        ),
      );
    case "open_incident":
      return String(
        await tools.openIncident.invoke(openIncidentInputSchema.parse(input)),
      );
    case "resolve_incident":
      return String(
        await tools.resolveIncident.invoke(resolveIncidentInputSchema.parse(input)),
      );
  }
}

export const createBenchStrategies: BenchStrategyFactory = (
  store,
  noReplanner,
) => {
  const tools = createOperationalTools(store);
  return {
    react: createReactStrategy({ tools: Object.values(tools) }),
    "plan-and-execute": createPlanAndExecuteStrategy({
      noReplanner,
      toolExecutor: (name, args) =>
        executeOperationalTool(tools, name, args),
    }),
  };
};

function countInAnswer(answer: string, expected: number): boolean {
  const match = answer.match(/^\s*(\d+)\s*$/);
  return match?.[1] === String(expected);
}

function oldestAlert<T extends { createdAt: Date; id: string }>(
  alerts: readonly T[],
): T | undefined {
  return [...alerts].sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id),
  )[0];
}

async function verifyScenario(
  scenario: ScenarioId,
  answer: string,
  store: InMemoryOperationalStore,
  initialAlerts: Awaited<ReturnType<InMemoryOperationalStore["listAlerts"]>>,
): Promise<boolean> {
  const [alerts, incidents] = await Promise.all([
    store.listAlerts("all"),
    store.listIncidents("all"),
  ]);
  const firingAlerts = alerts.filter(({ status }) => status === "firing");

  switch (scenario) {
    case "C1": {
      const expected = alerts.filter(
        ({ status, severity }) => status === "firing" && severity === "critical",
      ).length;
      return incidents.length === 0 && countInAnswer(answer, expected);
    }
    case "C2": {
      const expectedServices = ["checkout", "payments", "catalog"];
      return (
        incidents.length === expectedServices.length &&
        incidents.every(
          (incident, index) =>
            incident.serviceId === expectedServices[index] &&
            incident.severity === "medium" &&
            incident.status === (index === 0 ? "resolved" : "open"),
        )
      );
    }
    case "C3": {
      const oldest = oldestAlert(
        initialAlerts.filter(({ status }) => status === "firing"),
      );
      if (!oldest || incidents.length !== 1) return false;
      const incident = incidents[0];
      if (
        incident?.serviceId !== oldest.serviceId ||
        incident.severity !== oldest.severity ||
        incident.status !== "open"
      ) {
        return false;
      }
      const openIncidentServices = new Set(
        incidents
          .filter(({ status }) => status === "open")
          .map(({ serviceId }) => serviceId),
      );
      const remaining = firingAlerts.filter(
        ({ serviceId }) => !openIncidentServices.has(serviceId),
      ).length;
      return countInAnswer(answer, remaining);
    }
  }
}

export function parseBenchArgs(args: readonly string[]): BenchOptions {
  let scenariosArg: string | undefined;
  let noReplanner = false;

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    switch (option) {
      case "--scenario": {
        const value = args[index + 1];
        if (!value || value.startsWith("--")) {
          throw new Error("--scenario requires C1, C2, or C3.");
        }
        if (scenariosArg !== undefined) {
          throw new Error("--scenario may only be provided once.");
        }
        scenariosArg = value;
        index += 1;
        break;
      }
      case "--no-replanner":
        if (noReplanner) {
          throw new Error("--no-replanner may only be provided once.");
        }
        noReplanner = true;
        break;
      default:
        throw new Error(`Unknown bench option: ${option}`);
    }
  }

  const selectedScenarios = (scenariosArg ?? "C1,C2,C3").split(",");
  const parsedScenarios = selectedScenarios.map((scenario) =>
    scenarioIdSchema.parse(scenario.trim()),
  );
  if (new Set(parsedScenarios).size !== parsedScenarios.length) {
    throw new Error("--scenario must not contain duplicate scenario names.");
  }

  return benchOptionsSchema.parse({
    scenarios: parsedScenarios,
    noReplanner,
  });
}

export async function runBenchmark(
  optionsInput: BenchOptions,
  strategyFactory: BenchStrategyFactory = createBenchStrategies,
): Promise<BenchRow[]> {
  const options = benchOptionsSchema.parse(optionsInput);
  const rows: BenchRow[] = [];

  for (const scenarioId of options.scenarios) {
    const scenario = scenarios[scenarioId];
    for (const strategyName of ["react", "plan-and-execute"] as const) {
      const store = new InMemoryOperationalStore(DEMO_DATA, DEMO_RUNBOOKS);
      const initialAlerts = await store.listAlerts("all");
      const strategies = strategyFactory(store, options.noReplanner);
      const strategy = strategies[strategyName];

      const result = await strategy.run(scenario.input, { maxIterations: 8 });
      const success = !result.answer.startsWith("[FAILED]");
      const accuracy = success &&
        await verifyScenario(
          scenarioId,
          result.answer,
          store,
          initialAlerts,
        );
      if (!success) {
        console.error(`${scenarioId} ${strategyName} failed: ${result.answer}`);
      }
      rows.push({
        scenario: `${scenario.id} ${scenario.title}`,
        strategy: strategyName,
        accuracy,
        llCalls: result.metrics.llmCalls,
        latencyMs: result.metrics.latencyMs,
      });
    }
  }

  return rows;
}

export function formatBenchmarkTable(rows: readonly BenchRow[]): string {
  const headers = ["cenário", "estratégia", "acerto", "llCalls", "latencyMs"];
  const values = rows.map((row) => [
    row.scenario,
    row.strategy,
    row.accuracy ? "sim" : "não",
    String(row.llCalls),
    row.latencyMs.toFixed(2),
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...values.map((row) => row[index]?.length ?? 0)),
  );
  const format = (cells: readonly string[]) =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join(" | ")} |`;
  const separator = `|-${widths.map((width) => "-".repeat(width)).join("-|-")}-|`;
  return [format(headers), separator, ...values.map(format)].join("\n");
}

export async function main(args: readonly string[] = process.argv.slice(2)) {
  try {
    const options = parseBenchArgs(args);
    const rows = await runBenchmark(options);
    console.log(formatBenchmarkTable(rows));
    if (rows.some(({ accuracy }) => !accuracy)) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Benchmark execution failed.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("/bench.ts")) {
  await main();
}
