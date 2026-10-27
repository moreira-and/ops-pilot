import assert from "node:assert/strict";
import test from "node:test";
import type { ReasoningResult, ReasoningStrategy } from "./reasoning.js";
import { createProductionGraph } from "./production-graph.js";
import { recordFallback, recordModelUsed } from "./model-usage.js";

const routes = ["react", "plan-and-execute", "reflect:react"] as const;
type Route = (typeof routes)[number];

function fakeStrategy(name: Route, calls: string[]): ReasoningStrategy {
  return {
    name,
    async run(input) {
      calls.push(name);
      return {
        answer: `${name}: ${input}`,
        trace: [{
          sequence: 0,
          type: "answer",
          node: "answer",
          content: `${name}: ${input}`,
        }],
        metrics: { llmCalls: 2, latencyMs: 4 },
      };
    },
  };
}

function strategies(calls: string[]): Record<Route, ReasoningStrategy> {
  return {
    react: fakeStrategy("react", calls),
    "plan-and-execute": fakeStrategy("plan-and-execute", calls),
    "reflect:react": fakeStrategy("reflect:react", calls),
  };
}

test("automatic routing runs exactly the selected strategy and counts the router call", async () => {
  for (const route of routes) {
    const calls: string[] = [];
    const graph = createProductionGraph({
      strategies: strategies(calls),
      route: async () => ({
        route,
        reason: `Selected ${route} for this request.`,
      }),
    });

    const result = await graph.run("Inspect the production alert");

    assert.deepEqual(calls, [route]);
    assert.match(result.answer, new RegExp(`^${route}:`));
    assert.equal(result.metrics.llmCalls, 3);
    assert.deepEqual(
      result.trace.map((event) => event.node),
      ["context", "router", "response"],
    );
    assert.deepEqual(
      result.trace.map((event) => event.sequence),
      result.trace.map((_, sequence) => sequence),
    );
    assert.equal(result.trace.at(-1)?.type, "answer");
    assert.equal(result.trace.filter((event) => event.type === "answer").length, 1);
    assert.ok(result.trace.every((event) => event.node.length > 0));
    assert.deepEqual(result.trace[1], {
      sequence: 1,
      type: "route",
      node: "router",
      route,
      reason: `Selected ${route} for this request.`,
      source: "router",
    });
  }
});

test("explicit route bypasses router and records an override", async () => {
  const calls: string[] = [];
  let routerCalls = 0;
  const graph = createProductionGraph({
    strategies: strategies(calls),
    route: async () => {
      routerCalls += 1;
      return { route: "react", reason: "Should not be used." };
    },
  });

  const result = await graph.run("Inspect the incident", {}, "plan-and-execute");

  assert.deepEqual(calls, ["plan-and-execute"]);
  assert.equal(routerCalls, 0);
  assert.equal(result.metrics.llmCalls, 2);
  assert.deepEqual(result.trace[1], {
    sequence: 1,
    type: "route",
    node: "router",
    route: "plan-and-execute",
    reason: "Strategy selected by request override.",
    source: "override",
  });
});

test("response node emits one final answer event when a strategy omits it", async () => {
  const strategy: ReasoningStrategy = {
    name: "react",
    async run(): Promise<ReasoningResult> {
      return {
        answer: "The alert is resolved.",
        trace: [],
        metrics: { llmCalls: 1, latencyMs: 1 },
      };
    },
  };
  const graph = createProductionGraph({
    strategies: {
      react: strategy,
      "plan-and-execute": strategy,
      "reflect:react": strategy,
    },
    route: async () => ({ route: "react", reason: "Direct request." }),
  });

  const result = await graph.run("Inspect the alert");

  assert.deepEqual(result.trace.at(-1), {
    sequence: 2,
    node: "response",
    type: "answer",
    content: "The alert is resolved.",
  });
  assert.equal(result.trace.filter((event) => event.type === "answer").length, 1);
});

test("rejects malformed or unsupported router decisions without a fallback", async () => {
  const calls: string[] = [];
  const graph = createProductionGraph({
    strategies: strategies(calls),
    route: async () => ({ route: "unknown", reason: "Unsupported route." }),
  });

  await assert.rejects(graph.run("Inspect the alert"));
  assert.deepEqual(calls, []);
});

test("preserves strategy failures as failures instead of returning a successful answer", async () => {
  const failed: ReasoningStrategy = {
    name: "react",
    async run(): Promise<ReasoningResult> {
      return {
        answer: "[FAILED] strategy failed",
        trace: [{
          sequence: 0,
          type: "answer",
          node: "answer",
          content: "[FAILED] strategy failed",
        }],
        metrics: { llmCalls: 1, latencyMs: 1 },
      };
    },
  };
  const graph = createProductionGraph({
    strategies: {
      react: failed,
      "plan-and-execute": failed,
      "reflect:react": failed,
    },
    route: async () => ({ route: "react", reason: "Direct request." }),
  });

  const result = await graph.run("Inspect the alert");

  assert.match(result.answer, /^\[FAILED\]/);
});

test("fallback events and modelUsed are reported from the model usage scope", async () => {
  const strategy: ReasoningStrategy = {
    name: "react",
    async run() {
      recordFallback({ from: "a/primary", to: "b/backup", reason: "HTTP 503" });
      recordModelUsed("b/backup");
      return {
        answer: "done",
        trace: [{ sequence: 0, type: "answer", node: "answer", content: "done" }],
        metrics: { llmCalls: 1, latencyMs: 1 },
      };
    },
  };
  const graph = createProductionGraph({
    strategies: { react: strategy },
    route: async () => ({ route: "react", reason: "Direct request route." }),
  });

  const result = await graph.run("Inspect the alert");

  assert.equal(result.metrics.modelUsed, "b/backup");
  assert.deepEqual(result.trace.map((event) => event.type), [
    "observation",
    "route",
    "fallback",
    "answer",
  ]);
  assert.deepEqual(result.trace.map((event) => event.sequence), [0, 1, 2, 3]);
  assert.deepEqual(result.trace[2], {
    sequence: 2,
    node: "model",
    type: "fallback",
    from: "a/primary",
    to: "b/backup",
    reason: "HTTP 503",
  });
});

test("runs without fallback expose no fallback event", async () => {
  const graph = createProductionGraph({
    strategies: strategies([]),
    route: async () => ({ route: "react", reason: "Direct request route." }),
  });
  const result = await graph.run("Inspect the alert");
  assert.equal(result.trace.some(({ type }) => type === "fallback"), false);
  assert.equal(result.metrics.modelUsed, undefined);
});
