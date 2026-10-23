# Data Model: Context Token Metrics

- **TokenEstimate**: integer ≥ 0 = ceil(characters / 4); 0 for empty text.
- **PromptUsage** (in-memory, per turn): sum of prompt tokens over model calls keyed by run id; `undefined` when no call reported usage.
- **ContextBreakdown**: `{ system, summary, history, memories, message }`, each a non-negative integer estimate; absent source = 0.
- **ChatMetrics** (extends existing `llmCalls`, `latencyMs`, `historyMessages`): adds `promptTokens?: number` (int ≥ 0, real) and `contextBreakdown: ContextBreakdown`.

No persistence, no state transitions.
