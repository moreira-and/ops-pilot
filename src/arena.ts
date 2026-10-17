import { z } from "zod";
import { planAndExecuteStrategy } from "./agents/plan-and-execute.js";
import { reactStrategy } from "./agents/react.js";
import type {
  ReasoningOptions,
  ReasoningStrategy,
} from "./agents/reasoning.js";
import { withReflection } from "./agents/reflection.js";
import { formatTrace } from "./agents/trace.js";

const strategyNameSchema = z.enum([
  "react",
  "plan-and-execute",
  "reflect:react",
  "reflect:plan-and-execute",
]);
const arenaOptionsSchema = z.object({
  input: z.string().trim().min(1),
  strategies: z.array(strategyNameSchema).min(1),
  maxIterations: z.number().int().positive(),
}).superRefine(({ strategies }, context) => {
  if (new Set(strategies).size !== strategies.length) {
    context.addIssue({
      code: "custom",
      message: "Duplicate strategies are not allowed.",
      path: ["strategies"],
    });
  }
});

export type ArenaOptions = z.infer<typeof arenaOptionsSchema>;
export type StrategyRegistry = Record<string, ReasoningStrategy>;

export function parseArenaArgs(args: readonly string[]): ArenaOptions {
  let input: string | undefined;
  let strategies: string | undefined;
  let maxIterations: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${option}.`);
    }
    switch (option) {
      case "--input":
        if (input !== undefined) throw new Error("--input may only be provided once.");
        input = value;
        break;
      case "--strategies":
        if (strategies !== undefined) {
          throw new Error("--strategies may only be provided once.");
        }
        strategies = value;
        break;
      case "--max-iterations":
        if (maxIterations !== undefined) {
          throw new Error("--max-iterations may only be provided once.");
        }
        maxIterations = value;
        break;
      default:
        throw new Error(`Unknown arena option: ${option}`);
    }
    index += 1;
  }

  const selected = (strategies ?? "react").split(",");
  if (selected.some((name) => name.length === 0)) {
    throw new Error("--strategies must be a comma-separated list of strategy names.");
  }
  if (selected.some((name) => !strategyNameSchema.safeParse(name).success)) {
    throw new Error(`Unknown strategy in --strategies: ${strategies}`);
  }
  if (maxIterations !== undefined && !/^[1-9]\d*$/.test(maxIterations)) {
    throw new Error("--max-iterations must be a positive integer.");
  }

  return arenaOptionsSchema.parse({
    input,
    strategies: selected,
    maxIterations: Number(maxIterations ?? 8),
  });
}

function safeFailure(error: unknown): string {
  if (error instanceof Error && error.name === "DatabaseConfigurationError") {
    return error.message;
  }
  if (error instanceof Error && error.name === "ModelConfigurationError") {
    return error.message;
  }
  return "An internal strategy error occurred.";
}

export async function runArena(
  optionsInput: ArenaOptions,
  strategies: StrategyRegistry,
  write: (line: string) => void = console.log,
) {
  const options = arenaOptionsSchema.parse(optionsInput);
  const results: Array<{
    strategy: string;
    answer: string;
    trace: string;
    metrics: { llmCalls: number; latencyMs: number };
  }> = [];

  for (const strategyName of options.strategies) {
    const strategy = strategies[strategyName];
    if (!strategy) {
      write(`Strategy ${strategyName}: FAILED - strategy is not configured.`);
      continue;
    }
    try {
      const result = await strategy.run(options.input, {
        maxIterations: options.maxIterations,
      } satisfies ReasoningOptions);
      const trace = formatTrace(result.trace);
      if (result.answer.startsWith("[FAILED]")) {
        write(`Strategy ${strategy.name}: FAILED`);
        write(`Answer: ${result.answer}`);
        write(`Trace:\n${trace}`);
        write(`Metrics: ${JSON.stringify(result.metrics)}`);
        continue;
      }
      write(`Strategy: ${strategy.name}`);
      write(`Answer: ${result.answer}`);
      write(`Trace:\n${trace}`);
      write(`Metrics: ${JSON.stringify(result.metrics)}`);
      results.push({
        strategy: strategy.name,
        answer: result.answer,
        trace,
        metrics: result.metrics,
      });
    } catch (error) {
      write(`Strategy ${strategyName}: FAILED - ${safeFailure(error)}`);
    }
  }

  if (results.length === 0) {
    throw new Error("No selected strategy completed successfully.");
  }
  return results;
}

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  try {
    const options = parseArenaArgs(args);
    await runArena(options, {
      react: reactStrategy,
      "plan-and-execute": planAndExecuteStrategy,
      "reflect:react": withReflection(reactStrategy),
      "reflect:plan-and-execute": withReflection(planAndExecuteStrategy),
    });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Arena execution failed.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("/arena.ts")) {
  await main();
}
