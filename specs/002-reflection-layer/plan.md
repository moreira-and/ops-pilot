# Implementation Plan: Camada Reflection

**Branch**: `main` | **Date**: 2026-10-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-reflection-layer/spec.md`

## Summary

Add a generic `withReflection(strategy, opts)` decorator around the existing reasoning-strategy contract. It runs the wrapped strategy, evaluates each candidate answer against the observations in the accumulated trace using a structured-output critic, and reruns the full strategy with the original request and critique feedback when rejected. Stop at approval or after two regenerations by default. Add structured critique events and count critic plus rerun model calls in aggregate metrics. Expose reflected ReAct and Plan-and-Execute choices through the Arena.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS.

**Primary Dependencies**: Existing `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`, Zod 4, `tsx`, and `node:test`; no new dependency.

**Storage**: No new persistent data. Reflections reuse the selected strategy's existing tools and operational store.

**Testing**: `node --import tsx --test "src/**/*.test.ts"` via `npm test`; `npm run typecheck` for strict TypeScript validation. Add deterministic tests using injected strategy/model dependencies without OpenRouter or MySQL access.

**Target Platform**: Node.js 22 server/CLI on the existing Linux-compatible project runtime.

**Project Type**: TypeScript application with reusable reasoning modules and a CLI Arena.

**Performance Goals**: Bound extra generations to `maxReflections` (default 2); report elapsed time across the entire decorated run and count every actual additional model invocation exactly once. No latency SLA is specified.

**Constraints**: Preserve the `ReasoningStrategy` input/output contract. The critic must use the same configured model identity as the wrapped strategy; use the shared model factory in production and an injectable factory for deterministic tests or custom model configurations. Critic output is validated as `{ approved: boolean, feedback: string }`. A reflection limit is a non-negative safe integer. Each regeneration reruns the complete wrapped strategy with the original request and feedback, so operational tools can execute again; this behavior was explicitly selected and must be visible in design and tests. Existing internal Plan-and-Execute critique summaries remain compatible with the typed trace.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan alignment |
|-----------|------|----------------|
| Explicit MVC layers and pure domain logic | PASS | Reflection orchestration and trace aggregation remain in the agent/service layer; the Arena stays responsible for CLI selection and presentation. No new persistence or domain I/O is added. |
| Validate at boundaries with Zod | PASS | Validate `maxReflections`, structured critic results, strategy results, and the extended trace-event shape with Zod. |
| Represent domain errors explicitly | PASS | Invalid options and malformed critic output fail explicitly; model or regeneration errors are not converted into approval or a successful candidate. Preserve existing strategy failure reporting. |
| Tests and quality gates | PASS | Add `node:test` coverage for approval, rejection/regeneration, bounds, invalid output/failures, trace ordering, call counts, and Arena selectors; run typecheck and tests. |
| Security by default | PASS | Reuse existing configured model credentials without logging them. Document that complete strategy reruns may repeat tool side effects; no new destructive tool is introduced. |
| Spec Kit workflow | PASS | This phase generates design artifacts only; task breakdown and implementation remain for later phases. |

**Pre-design gate result**: PASS. Feature behavior and the material regeneration decision are specified.

**Post-design gate result**: PASS. Design preserves existing strategy and Arena boundaries, adds no dependencies or persistence, and makes repeated operational effects explicit.

## Project Structure

### Documentation (this feature)

```text
specs/002-reflection-layer/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── reasoning-strategies.md
│   └── arena-cli.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── reasoning.ts
│   ├── metrics.ts
│   ├── reflection.ts
│   ├── reflection.test.ts
│   ├── react.ts
│   └── plan-and-execute.ts
└── arena.ts
```

**Structure Decision**: Extend the existing single TypeScript project. Implement the reusable decorator and its focused tests under `src/agents`; update the shared strategy/trace contract and metric integration there; wire reflected strategy names into `src/arena.ts` and its existing tests. No controller, model, migration, or new storage module is needed.

## Design Decisions

- Keep `ReasoningStrategy.run(input, options)` as the decorator boundary. The decorator accepts any implementation of that interface, invokes it once initially, then invokes the same strategy with the original request plus prior rejection feedback for each permitted regeneration.
- Default the critic to the shared `createModel` configuration used by both production strategies; provide model construction as a dependency for tests and custom compositions. It uses structured output and Zod parsing rather than accepting free-form JSON or treating parse failures as rejection/approval.
- Evaluate each candidate against the observation events collected so far. Append a `critique` event after each evaluation, then append the next run's trace if another regeneration occurs. Renumber merged trace events contiguously because each underlying strategy starts its own sequence at zero.
- Extend the `critique` trace shape with `approved` and `feedback` for Reflection events while retaining the existing `content` form used by Plan-and-Execute's internal replanner summaries. Keep hidden model reasoning out of public events.
- Sum the underlying strategy's `llmCalls` for every run with the critic's measured model invocation count. Use one monotonic timer around the complete decorator invocation for `latencyMs`; do not sum per-run latencies.
- Validate `maxReflections` as a non-negative safe integer with default `2`. A value of zero returns the initial strategy result without creating the critic or adding a critique event.
- Register `reflect:react` and `reflect:plan-and-execute` as additional Arena choices that wrap the corresponding existing strategy. Preserve all existing selectors and output formatting.
- A rejection reruns the complete strategy as explicitly chosen. This can repeat tool actions and mutations; the reflection trace makes each pass visible, and the contract documents this consequence rather than implying tool idempotency.

## Complexity Tracking

No constitution violations, additional projects, dependencies, persistence, or external services.
