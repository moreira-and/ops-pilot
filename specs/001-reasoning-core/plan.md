# Implementation Plan: Núcleo de raciocínio do OpsPilot

**Branch**: `[main]` | **Date**: 2026-10-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-reasoning-core/spec.md` (feature identifier: `001-reasoning-core`)

## Summary

Add a shared reasoning-strategy contract and a single OpenRouter-backed model factory, then implement the ReAct and Plan-and-Execute flows over Zod-validated alert and incident tools. Use a committed JSON fixture to seed the default in-memory operational store, and expose a CLI arena that runs selected strategies against the same input and reports ordered traces and execution metrics. Tests use injected model and store dependencies so core behavior is deterministic and network-free.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS.

**Primary Dependencies**: TypeScript ESM on Node 22; existing `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`, Sequelize 6, Zod 4, `tsx`, and `node:test`, plus `mysql2` (Sequelize MySQL dialect) and `umzug` (versioned migrations).

**Storage**: The current seed and default tool path use `src/scripts/demo-data.json` and an in-memory operational store. New incidents and mutations are available during the process and are reset on restart. The Sequelize/MySQL models, adapter, and migrations remain in the codebase but are not initialized by the seed, tools, or arena.

**Testing**: `node --import tsx --test "src/**/*.test.ts"` via `npm test`; `npm run typecheck` for strict TypeScript validation. Unit tests inject deterministic stores and model doubles; they do not call OpenRouter or MySQL.

**Target Platform**: Node.js 22 server/CLI on the existing Linux-compatible project runtime.

**Project Type**: TypeScript application with a CLI arena and domain/persistence modules.

**Performance Goals**: Report actual elapsed execution latency per strategy; no hard latency SLA is specified. Seed and tool operations cover the small demo dataset and normal in-memory CRUD.

**Constraints**: Model access requires `OPENROUTER_API_KEY` and `OPENROUTES_MODEL`, uses the existing OpenAI-compatible integration with OpenRouter's base URL and temperature zero, and must fail explicitly for missing configuration. The ReAct strategy follows the requested `createReactAgent` example even though the installed LangGraph version marks it deprecated. Strategy iteration limits are positive integers; Plan-and-Execute may execute or retain no more than eight total steps across replans. The JSON demo seed includes six services and seven alerts, including a firing catalog alert, with a 4/3 firing/resolved split. Never log secrets or expose hidden provider reasoning.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan alignment |
|-----------|------|----------------|
| Explicit MVC layers and pure domain logic | PASS | Tool adapters call services; services own use cases; Sequelize models own persistence. Deterministic domain and trace-formatting logic remains I/O-free. |
| Zod at boundaries | PASS | CLI arguments, tool arguments/results, planner output, and strategy result use Zod schemas. |
| Explicit domain errors | PASS | Validation, missing records/services, database failures, and model failures remain explicit and are reported at CLI/service boundaries. |
| Tests and quality gates | PASS | Add `node:test` coverage for stores, tools, trace formatting, strategies, and CLI parsing; run typecheck and tests. |
| Security by default | PASS | Read model and database settings from environment, never include secrets in artifacts/output, validate tool writes, and add no destructive action without explicit guardrails and human review. |
| Spec Kit workflow | PASS | Design artifacts are limited to this phase; tasks and implementation remain for later commands. |

**Pre-design gate result**: PASS. No constitution violations or unresolved feature-scope clarifications remain.

**Post-design gate result**: PASS. The proposed modules preserve the same boundaries; no added dependency, secret handling, or destructive operation conflicts with the constitution.

## Project Structure

### Documentation (this feature)

```text
specs/001-reasoning-core/
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
│   ├── model.ts
│   ├── reasoning.ts
│   ├── trace.ts
│   ├── tools.ts
│   ├── react.ts
│   ├── plan-and-execute.ts
│   ├── reasoning.test.ts
│   ├── trace.test.ts
│   └── strategies.test.ts
├── models/
│   ├── database.ts
│   ├── service.ts
│   ├── alert.ts
│   └── incident.ts
├── migrations/
│   └── 001-create-operational-tables.ts
├── services/
│   ├── alert-service.ts
│   └── incident-service.ts
├── scripts/seed-demo.ts
└── arena.ts
```

**Structure Decision**: Use the existing single TypeScript project and its `src/` entry point. Keep graph orchestration in `src/agents`, business operations in services, the default in-memory store in `src/services`, and the JSON fixture and arena as CLI entry points. Sequelize definitions, the MySQL adapter, and migrations remain available but are not part of the current runtime path. `src/agents/tools.ts` is the intended spelling of the tools module.

## Design Decisions

- Construct the chat model only through `src/agents/model.ts` using the existing `ChatOpenAI` integration with OpenRouter's compatible API base URL; use the requested LangGraph `createReactAgent` prebuilt ReAct flow. Inject model and tool/store dependencies into strategies for isolated tests.
- Count each actual model invocation at its start, including retry/failure attempts, deduplicating callback events by model run ID; compute `latencyMs` with a monotonic clock around the whole strategy run.
- Define one strategy iteration as one reasoning/plan decision cycle, with no more than one executor step per Plan-and-Execute cycle. The configured maximum bounds cycles; an eight-step total ceiling also bounds execution across all replans.
- Retain completed step/result pairs across replans and ignore steps that repeat completed instructions so a replan cannot repeat completed mutations.
- Capture graph output, tool-call IDs, validated/redacted tool arguments, results or errors, plan/replan summaries, and final answers as ordered trace events. A `thought` event may contain only an explicit, user-visible rationale emitted by the model; do not expose hidden chain-of-thought or fabricate a rationale.
- Run selected arena strategies sequentially in the CLI order against the same input. Tool actions share the seeded in-memory store for the process lifetime; the arena identifies each result separately.
- Load and validate stable service/alert identifiers from the repeatable JSON demo fixture before exposing the default tools. The existing Sequelize/MySQL adapter remains separate from this in-memory path.

## Complexity Tracking

No constitution violations or additional projects/external services. Add only the Sequelize-supported MySQL driver and a migration runner required for safe, versioned schema changes. The user-requested ReAct constructor is deprecated in the installed LangGraph release; migrate to the maintained LangChain agent API in a separate change when the user approves the divergence from the supplied example.
