import assert from "node:assert/strict";
import test from "node:test";
import { buildContext } from "../context/context-builder.js";
import { createPlanAndExecuteStrategy } from "./plan-and-execute.js";
import { createOperationalTools } from "./tools.js";
import { DEMO_DATA } from "../scripts/demo-data.js";
import { DEMO_RUNBOOKS } from "../scripts/demo-runbooks.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";

const finish = {
  decision: "finish" as const,
  steps: [],
  answer: "All requested checks are complete.",
  critique: "The requested checks are complete.",
};

test("Plan-and-Execute receives the composed context as its user task", async () => {
  let plannerInput = "";
  const userPrompt = buildContext({
    message: "Inspect the current incident.",
    summary: "The database recovered.",
    history: [],
    memories: [],
  }, { summary: 0, history: 0, memories: 0 }).prompt;
  const strategy = createPlanAndExecuteStrategy({
    planner: async (input) => {
      plannerInput = input;
      return { steps: [] };
    },
    executor: async () => ({ tool: "list_alerts", args: { status: "all" } }),
    noReplanner: true,
  });

  await strategy.run(userPrompt);

  assert.equal(plannerInput, userPrompt);
});

test("executes one string step per cycle and passes completed results to replanning", async () => {
  const executed: string[] = [];
  const reviewedDoneCounts: number[] = [];
  const strategy = createPlanAndExecuteStrategy({
    planner: async () => ({
      steps: ["List firing alerts", "List resolved alerts"],
    }),
    executor: async (_input, step) => ({
      tool: "list_alerts",
      args: { status: step.includes("firing") ? "firing" : "resolved" },
    }),
    replanner: async ({ plan, done }) => {
      reviewedDoneCounts.push(done.length);
      return done.length === 2
        ? finish
        : {
            decision: "continue",
            steps: plan,
            answer: "",
            critique: "Continue with the remaining step.",
          };
    },
    toolExecutor: async (tool, args) => {
      executed.push(`${tool}:${String(args.status)}`);
      return "[]";
    },
  });

  const result = await strategy.run("Inspect alerts", { maxIterations: 2 });
  assert.equal(result.answer, finish.answer);
  assert.deepEqual(executed, ["list_alerts:firing", "list_alerts:resolved"]);
  assert.deepEqual(reviewedDoneCounts, [1, 2]);
  assert.equal(result.metrics.llmCalls, 5);
  assert.equal(result.trace.filter(({ type }) => type === "action").length, 2);
  assert.deepEqual(
    result.trace.map(({ sequence }) => sequence),
    result.trace.map((_, index) => index),
  );
});

test("replanner adjusts remaining work without repeating a completed step", async () => {
  const executed: string[] = [];
  const strategy = createPlanAndExecuteStrategy({
    planner: async () => ({ steps: ["Check alert state", "Old follow-up"] }),
    executor: async (_input, step) => {
      executed.push(step);
      return { tool: "list_alerts", args: { status: "all" } };
    },
    replanner: async ({ done }) =>
      done.length === 1
        ? {
            decision: "adjust",
            steps: ["Check alert state", "New follow-up"],
            answer: "",
            critique: "Replace the obsolete follow-up.",
          }
        : finish,
    toolExecutor: async () => "Observed alerts.",
  });

  const result = await strategy.run("Check the alert state and follow up");
  assert.deepEqual(executed, ["Check alert state", "New follow-up"]);
  assert.equal(result.answer, finish.answer);
  assert.equal(result.trace.filter(({ type }) => type === "plan").length, 2);
});

test("terminates after maxIterations and reports the bound", async () => {
  const strategy = createPlanAndExecuteStrategy({
    planner: async () => ({ steps: ["First step", "Second step"] }),
    executor: async () => ({
      tool: "list_alerts",
      args: { status: "firing" },
    }),
    replanner: async ({ plan }) => ({
      decision: "continue",
      steps: plan,
      answer: "",
      critique: "More work remains.",
    }),
    toolExecutor: async () => "[]",
  });

  const result = await strategy.run("Inspect alerts", { maxIterations: 1 });
  assert.match(result.answer, /iteration limit/i);
  assert.equal(result.trace.filter(({ type }) => type === "action").length, 1);
  assert.equal(result.metrics.llmCalls, 3);
});

test("rejects plans longer than eight steps before executing them", async () => {
  let executed = false;
  const strategy = createPlanAndExecuteStrategy({
    planner: async () => ({
      steps: Array.from({ length: 9 }, (_, index) => `Step ${index + 1}`),
    }),
    executor: async () => ({
      tool: "list_alerts",
      args: { status: "firing" },
    }),
    replanner: async () => finish,
    toolExecutor: async () => {
      executed = true;
      return "[]";
    },
  });

  const result = await strategy.run("Too many steps");
  assert.match(result.answer, /failed/i);
  assert.equal(result.trace.at(-1)?.type, "answer");
  assert.equal(executed, false);
});

test("does not permit replanning to exceed eight total steps", async () => {
  const strategy = createPlanAndExecuteStrategy({
    planner: async () => ({
      steps: Array.from({ length: 8 }, (_, index) => `Initial ${index + 1}`),
    }),
    executor: async () => ({
      tool: "list_alerts",
      args: { status: "all" },
    }),
    replanner: async () => ({
      decision: "adjust",
      steps: Array.from({ length: 8 }, (_, index) => `Replacement ${index + 1}`),
      answer: "",
      critique: "Replace remaining steps.",
    }),
    toolExecutor: async () => "[]",
  });

  const result = await strategy.run("Inspect alerts", { maxIterations: 2 });
  assert.match(result.answer, /execution plan cannot exceed eight total steps/i);
  assert.equal(result.trace.at(-1)?.type, "answer");
});

test("reports the failing model phase and HTTP status without exposing its response", async () => {
  const providerError = Object.assign(new Error("sensitive provider response"), {
    status: 503,
  });
  const strategy = createPlanAndExecuteStrategy({
    planner: async () => ({ steps: ["List firing alerts"] }),
    executor: async () => ({
      tool: "list_alerts",
      args: { status: "firing" },
    }),
    replanner: async () => {
      throw providerError;
    },
    toolExecutor: async () => "[]",
  });

  const result = await strategy.run("Inspect alerts");

  assert.match(result.answer, /replanner model request failed \(HTTP 503\)/i);
  assert.doesNotMatch(result.answer, /sensitive provider response/i);
  assert.equal(result.metrics.llmCalls, 3);
  assert.equal(result.trace.at(-2)?.type, "observation");
});

test("finishes without execution when the planner returns no steps", async () => {
  const strategy = createPlanAndExecuteStrategy({
    planner: async () => ({ steps: [] }),
    executor: async () => {
      assert.fail("Executor must not run for an empty plan.");
    },
    replanner: async () => {
      assert.fail("Replanner must not run for an empty plan.");
    },
  });

  const result = await strategy.run("No work is required");
  assert.match(result.answer, /no actionable steps/i);
  assert.equal(result.metrics.llmCalls, 1);
  assert.deepEqual(result.trace.map(({ type }) => type), ["plan", "answer"]);
});

test("executes the original plan without replanner model calls when disabled", async () => {
  const executed: string[] = [];
  const strategy = createPlanAndExecuteStrategy({
    noReplanner: true,
    planner: async () => ({
      steps: ["Open checkout incident", "Resolve checkout incident"],
    }),
    executor: async (_input, step) => {
      executed.push(step);
      return {
        tool: step.startsWith("Open") ? "open_incident" : "resolve_incident",
        args: step.startsWith("Open")
          ? { title: "Checkout", service: "checkout", severity: "sev2" }
          : { id: "incident-1" },
      };
    },
    toolExecutor: async () => "completed",
  });

  const result = await strategy.run("Complete the planned incident workflow");

  assert.deepEqual(executed, [
    "Open checkout incident",
    "Resolve checkout incident",
  ]);
  assert.equal(result.metrics.llmCalls, 3);
  assert.equal(result.trace.filter(({ type }) => type === "critique").length, 0);
  assert.match(result.answer, /Completed 2 planned step/i);
});

test("forget_preference uses the request user identity outside model-selected arguments", async () => {
  const recalledUsers: string[] = [];
  const forgotten: Array<{ userId: string; memoryId: string }> = [];
  const strategy = createPlanAndExecuteStrategy({
    memoryStore: {
      async recall(userId) {
        recalledUsers.push(userId);
        return [{
          id: "memory-1",
          userId,
          fact: "The operator prefers email.",
          embedding: new Array(384).fill(0),
          createdAt: new Date("2026-10-23T00:00:00.000Z"),
          score: 0.9,
        }];
      },
      forget(userId, memoryId) {
        forgotten.push({ userId, memoryId });
        return true;
      },
    },
    noReplanner: true,
    planner: async () => ({ steps: ["Forget email preference"] }),
    executor: async () => ({
      tool: "forget_preference",
      args: { preference: "email" },
    }),
  });

  const result = await strategy.run("Forget my email preference", {
    userId: "operator-1",
  });

  assert.deepEqual(recalledUsers, ["operator-1"]);
  assert.deepEqual(forgotten, [{ userId: "operator-1", memoryId: "memory-1" }]);
  assert.match(result.answer, /deleted/);
});

test("routes incident-list and runbook operations through isolated operational tools", async () => {
  const store = new SqliteOpsStore(":memory:");
  await store.upsertDemoData(DEMO_DATA, DEMO_RUNBOOKS);
  const operationalTools = createOperationalTools(store);
  const requests = [
    {
      step: "List open incidents",
      tool: "list_incidents" as const,
      args: { status: "open" },
    },
    {
      step: "Consult checkout runbook",
      tool: "consultar_runbook" as const,
      args: { service: "checkout" },
    },
  ];

  try {
    for (const request of requests) {
      const strategy = createPlanAndExecuteStrategy({
        operationalTools,
        noReplanner: true,
        planner: async () => ({ steps: [request.step] }),
        executor: async () => ({ tool: request.tool, args: request.args }),
      });
      const result = await strategy.run(request.step);
      assert.ok(result.trace.some(
        (event) =>
          event.type === "action" &&
          event.tool === request.tool,
      ));
      const observation = result.trace.find(
        (event) => event.type === "observation" && event.tool === request.tool,
      );
      assert.ok(observation && observation.type === "observation");
      if (request.tool === "consultar_runbook") {
        assert.match(observation.content, /checkout/);
      }
    }
  } finally {
    store.close();
  }
});
