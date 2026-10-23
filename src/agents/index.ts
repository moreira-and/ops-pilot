import { createPlanAndExecuteStrategy, planAndExecuteStrategy } from "./plan-and-execute.js";
import { createReactStrategy, reactStrategy } from "./react.js";
import type { ReasoningStrategy } from "./reasoning.js";
import type { PreferenceMemoryStore } from "../services/preference-forget-service.js";

export function createStrategyRegistry(
  memoryStore?: PreferenceMemoryStore,
): Record<string, ReasoningStrategy> {
  if (!memoryStore) {
    return {
      react: reactStrategy,
      "plan-and-execute": planAndExecuteStrategy,
    };
  }
  return {
    react: createReactStrategy({ memoryStore }),
    "plan-and-execute": createPlanAndExecuteStrategy({ memoryStore }),
  };
}

export const strategyRegistry: Record<string, ReasoningStrategy> =
  createStrategyRegistry();
