import assert from "node:assert/strict";
import test from "node:test";
import {
  parseArenaArgs,
  runArena,
  type ArenaOptions,
} from "./arena.js";
import type { ReasoningStrategy } from "./agents/reasoning.js";

const result = {
  answer: "Checked.",
  trace: [{ sequence: 0, type: "answer" as const, content: "Checked." }],
  metrics: { llmCalls: 1, latencyMs: 2 },
};

test("parses required input, strategy selection, and positive iteration limit", () => {
  assert.deepEqual(parseArenaArgs(["--input", "check alerts"]), {
    input: "check alerts",
    strategies: ["react"],
    maxIterations: 8,
  });
  assert.deepEqual(
    parseArenaArgs([
      "--input",
      "check alerts",
      "--strategies",
      "react,plan-and-execute",
      "--max-iterations",
      "3",
    ]),
    {
      input: "check alerts",
      strategies: ["react", "plan-and-execute"],
      maxIterations: 3,
    },
  );
});

test("rejects invalid and ambiguous CLI arguments", () => {
  assert.throws(() => parseArenaArgs([]));
  assert.throws(() => parseArenaArgs(["--input", " "]));
  assert.throws(() => parseArenaArgs(["--input", "x", "--strategies", "react,react"]));
  assert.throws(() => parseArenaArgs(["--input", "x", "--strategies", "unknown"]));
  assert.throws(() => parseArenaArgs(["--input", "x", "--max-iterations", "0"]));
  assert.throws(() => parseArenaArgs(["--input", "x", "--max-iterations", "1.5"]));
});

test("runs selected strategies sequentially with the same request and reports each", async () => {
  const received: Array<{ name: string; input: string; maxIterations?: number }> = [];
  const strategies: Record<string, ReasoningStrategy> = {
    react: {
      name: "react",
      async run(input, options) {
        received.push({ name: this.name, input, maxIterations: options?.maxIterations });
        return result;
      },
    },
    "plan-and-execute": {
      name: "plan-and-execute",
      async run(input, options) {
        received.push({ name: this.name, input, maxIterations: options?.maxIterations });
        return result;
      },
    },
  };
  const output: string[] = [];
  const options: ArenaOptions = {
    input: "check alerts",
    strategies: ["react", "plan-and-execute"],
    maxIterations: 4,
  };
  await runArena(options, strategies, (line) => output.push(line));

  assert.deepEqual(received, [
    { name: "react", input: "check alerts", maxIterations: 4 },
    { name: "plan-and-execute", input: "check alerts", maxIterations: 4 },
  ]);
  assert.equal(output.filter((line) => line.includes("Strategy:")).length, 2);
  assert.ok(output.some((line) => line.includes("llmCalls")));
});

test("reports strategy failures and fails when every selected strategy fails", async () => {
  const broken: ReasoningStrategy = {
    name: "react",
    async run() {
      throw new Error("model unavailable");
    },
  };
  const output: string[] = [];
  await assert.rejects(
    runArena(
      { input: "check alerts", strategies: ["react"], maxIterations: 1 },
      { react: broken },
      (line) => output.push(line),
    ),
    /no selected strategy completed/i,
  );
  assert.ok(output.some((line) => line.includes("FAILED")));
});
