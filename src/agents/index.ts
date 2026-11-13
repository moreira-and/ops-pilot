import { createPlanAndExecuteStrategy, planAndExecuteStrategy } from "./plan-and-execute.js";
import { createReactStrategy, reactStrategy } from "./react.js";
import type { ReasoningStrategy } from "./reasoning.js";
import type { PreferenceMemoryStore } from "../services/preference-forget-service.js";
import type { PendingActionService } from "../services/pending-action-service.js";
import type { OperationalStore } from "../services/operational-store.js";
import { createOperationalTools, getDefaultOperationalTools } from "./tools.js";

export function createStrategyRegistry(
  memoryStore?: PreferenceMemoryStore,
  pendingActionService?: PendingActionService,
  operationalStore?: OperationalStore,
): Record<string, ReasoningStrategy> {
  if (!memoryStore && !pendingActionService && !operationalStore) {
    return {
      react: reactStrategy,
      "plan-and-execute": planAndExecuteStrategy,
    };
  }
  const operationalTools = operationalStore
    ? createOperationalTools(operationalStore, fetch, pendingActionService)
    : pendingActionService
    ? getDefaultOperationalTools(pendingActionService)
    : undefined;
  return {
    react: createReactStrategy({
      ...(memoryStore ? { memoryStore } : {}),
      ...(operationalTools ? { tools: Object.values(operationalTools) } : {}),
    }),
    "plan-and-execute": createPlanAndExecuteStrategy({
      ...(memoryStore ? { memoryStore } : {}),
      ...(operationalTools ? { operationalTools } : {}),
    }),
  };
}

export const strategyRegistry: Record<string, ReasoningStrategy> =
  createStrategyRegistry();
