# Implementation Plan: Grafo unificado de produção

**Branch**: `013-unified-production-graph` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-unified-production-graph/spec.md`

## Summary

Integrate chat execution through a single compiled production graph with context, router, three strategy, and response nodes. For automatic selection, use a structured `{ route, reason }` decision constrained to `react`, `plan-and-execute`, and `reflect:react`, guided by a routing table in the prompt. An explicitly supplied `/chat` `strategy` bypasses model routing and is recorded as an override. Normalize the resulting trace so every public event has a stable producer `node`, and include routing-model usage in the chat result metrics.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS.

**Primary Dependencies**: Existing `@langchain/langgraph`, `@langchain/openai`, `@langchain/core`, Express 5, and Zod 4; no new dependencies.

**Storage**: No new persistence. Existing conversation and memory stores, context construction, and operational stores retain their current ownership and lifecycle.

**Testing**: `node:test` via `tsx`; deterministic unit and HTTP tests inject route decisions and strategies. Run `npm run typecheck` and `npm test`; tests must not require OpenRouter or external services.

**Target Platform**: Node.js 22 HTTP service.

**Project Type**: TypeScript backend web service.

**Performance Goals**: Do not add a router model call when a valid explicit strategy is supplied. Automatic routing makes one structured decision call before the selected strategy. No additional latency SLA is specified.

**Constraints**: Use the existing model factory and callback-based model-call accounting. Keep context construction, conversation persistence, timeout handling, and response validation in their current service/boundary roles. Accept only the three registered route identifiers. Never silently replace an invalid route or expose hidden model reasoning. All trace events returned by `/chat`, including events appended by the chat service, must carry a node identifier.

**Scale/Scope**: One chat execution graph and the existing `POST /chat` path; three selectable strategy paths, one selected strategy per request.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan alignment |
|-----------|------|----------------|
| I. Explicit MVC layers and pure domain logic | PASS | The HTTP boundary validates requests and delegates to the existing chat service; the graph coordinates context, routing, and strategy execution without taking ownership of conversation persistence. |
| II. Validate at boundaries with Zod | PASS | Validate the optional strategy and structured router decision, validate graph/result state, and validate the final HTTP response with existing Zod boundaries. |
| III. Represent domain errors explicitly | PASS | Invalid strategy names and graph/model failures continue through explicit existing HTTP error handling; invalid router output does not become a fallback success. |
| IV. Tests and quality gates | PASS | Add deterministic graph and HTTP tests; run the typecheck and full test command required by the constitution. |
| V. Security by default | PASS | Use the configured model factory; do not put secrets or full private context into route trace events; add no destructive operations. |
| VI. Embedded SQLite persistence | PASS | No persistence changes; existing stores remain responsible for their data. |
| Spec Kit workflow | PASS | This phase produces design artifacts only; task breakdown and implementation remain subsequent phases. |

**Pre-design gate result**: PASS. The strategy identifiers were confirmed in the feature specification; no unresolved scope clarifications remain.

**Post-design gate result**: PASS. The graph is an orchestration layer over existing boundaries and introduces no persistence, dependency, or governance changes.

## Project Structure

### Documentation (this feature)

```text
specs/013-unified-production-graph/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── production-graph.md
└── tasks.md              # Created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── production-graph.ts       # Compiled orchestration and strategy routing
│   ├── production-graph.test.ts  # Deterministic routing, trace, and metric tests
│   ├── reasoning.ts              # Shared route and node-aware trace schemas
│   ├── react.ts                  # Existing ReAct strategy
│   ├── plan-and-execute.ts       # Existing Plan-and-Execute strategy
│   ├── reflection.ts             # Existing Reflection decorator
│   └── index.ts                  # Strategy registry
├── http/
│   ├── server.ts                 # Optional strategy and graph integration
│   └── server.test.ts            # HTTP contract and override behavior
├── services/
│   └── chat-service.ts           # Existing context and conversation orchestration
└── context/
    └── context-builder.ts        # Existing context composition and budgets
```

**Structure Decision**: Extend the existing single backend project. Keep the graph in `src/agents/production-graph.ts`; reuse the context builder, chat service, model factory, strategies, and strategy registry instead of introducing a parallel service or persistence path. The graph consumes the context-enriched strategy input provided by the existing chat flow. The HTTP boundary supplies the optional route override and remains responsible for request/response validation and timeout translation.

## Design Decisions

- Build a compiled `StateGraph` with explicit `context`, `router`, `strategy-react`, `strategy-plan-and-execute`, `strategy-reflect-react`, and `response` nodes. Map the stable route identifier `reflect:react` to the graph-safe node name `strategy-reflect-react`. Follow the repository's existing LangGraph state-definition style rather than migrating unrelated strategy graphs to a new API.
- Validate the structured route decision with a Zod enum for exactly `react`, `plan-and-execute`, or `reflect:react`, plus a non-empty reason. Automatic routing uses `withStructuredOutput` through the existing model factory. An explicit strategy bypasses the router model invocation.
- Put a routing decision table in the router prompt: use `react` for direct, bounded requests; `plan-and-execute` for requests requiring multiple ordered operational steps; and `reflect:react` when the request calls for an evidence-checked answer. Treat ambiguous simple requests as `react`. A router decision outside the enum or with invalid output fails explicitly.
- Keep the chat service responsible for retrieving conversation history and memories, building the bounded context, and persisting messages. The graph receives that prepared input; its context node emits a generic context-prepared observation without copying private context into trace content.
- Add a `route` trace event that records the selected strategy, reason, and whether it came from automatic routing or the request override. Assign stable `node` values (`context`, `router`, the selected `strategy-*` node, or `response`) to graph events and tag chat-service-appended context-summary events with `context`. Normalize event sequence numbers after combining graph and strategy traces.
- Preserve the shared strategy result contract and existing metrics. Count the router's actual model invocation via `ModelCallCounter`, include it once in `llmCalls`, and measure graph latency around routing plus strategy execution. Preserve optional prompt-token usage when it is reported. A valid explicit override contributes no router model call.
- Keep existing `/chat` behavior not superseded by this feature, including user/conversation inputs, the `reflact` compatibility option, timeout, and response fields. Do not apply Reflection twice when the effective selected path is already `reflect:react`.
- Inject router/strategy dependencies for deterministic tests; use fake structured decisions and fake strategies to cover all routes, override bypass, malformed decisions, ordered traces, node metadata, and metrics without network access.

## Complexity Tracking

No constitution violations, new projects, persistence components, or external services. The graph adds one orchestration layer to centralize an existing route-selection and strategy-execution flow.
