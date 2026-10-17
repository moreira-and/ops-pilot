import assert from "node:assert/strict";
import test from "node:test";
import { createPlanAndExecuteStrategy } from "./plan-and-execute.js";

const finish = {
  decision: "finish" as const,
  steps: [],
  answer: "All requested checks are complete.",
  critique: "The requested checks are complete.",
};

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
