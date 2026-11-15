# Implementation Plan: Team Incident Coordination

**Branch**: `019-team-incident-coordination` | **Date**: 2026-11-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/019-team-incident-coordination/spec.md`

## Summary

Add `team` as a production graph route on the existing `/chat` flow. Implement a request-local LangGraph supervisor in `src/team/` whose structured `{ next, brief }` decisions dispatch to an analyst, planner, executor, or `done`. Record every supervisor decision as a typed `handoff` event with `from`, `to`, and `brief`. Restrict each role to its permitted capabilities, cap role dispatches at eight, and render decisions in the existing reasoning viewer. Route and trace schema changes must remain compatible with existing SQLite data.

## Technical Context

**Language/Version**: TypeScript ESM, `strict: true`, Node.js 22 LTS, React 19 with TypeScript.

**Primary Dependencies**: Existing `@langchain/langgraph`, `@langchain/core`, `@langchain/openai`, Express 5, Zod 4, React, and Vite; no new dependencies.

**Storage**: Team board is request-local and not persisted. Reuse the request trace and pending-action SQLite stores; extend their closed route/event constraints with a backward-compatible migration.

**Testing**: `node:test` via `tsx`; injected model, role, tool, trace-store, and HTTP dependencies. Validate with `npm run typecheck`, `npm test`, and `npm run build:web`. Tests must not require OpenRouter or external services.

**Target Platform**: Node.js 22 HTTP service and the existing browser-based War Room.

**Project Type**: TypeScript web service with React frontend.

**Performance Goals**: No new latency SLA is specified. The workflow may dispatch at most eight roles per request and must stop rather than exceed that bound.

**Constraints**: Reuse the existing production graph and `/chat` contract; model routing and team decisions use strict Zod schemas; every role receives only its allowed tools; executor writes must use the existing pending-action approval service; request state must be isolated; traces must not expose private model reasoning or the full blackboard; preserve SQLite constraints and existing trace rows; add no new package dependencies.

**Scale/Scope**: One team execution per chat request, with three roles (analyst, planner, executor), one supervisor, at most eight dispatches, and the existing “Ver raciocínio” viewer. No new HTTP endpoint, persistence store, or cross-request team memory.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan alignment |
|-----------|------|----------------|
| I. Explicit MVC layers and pure domain logic | PASS | Keep HTTP validation and response translation in the existing HTTP boundary; keep operational data access in existing services/tools; isolate team orchestration in `src/team/`. |
| II. Validate at boundaries with Zod | PASS | Validate supervisor output, role outputs, trace events, route values, HTTP payloads, and tool inputs/outputs with existing Zod schemas. |
| III. Represent domain errors explicitly | PASS | Propagate model/configuration and operation failures through explicit existing error translation; invalid routing must not produce a success-shaped response. |
| IV. Tests and quality gates | PASS | Add focused team graph, tool-permission, trace, persistence migration, HTTP, and viewer tests; run typecheck, all tests, and the web build. |
| V. Security by default | PASS | No new secrets or destructive bypasses; executor uses approval-gated tools; analyst/planner have no write capability; keep raw prompts and private reasoning out of traces. |
| VI. Embedded SQLite persistence | PASS | Reuse embedded SQLite and prepared statements; migrate closed route and event constraints while preserving existing records. The request board remains in-memory. |
| Spec Kit workflow | PASS | This phase generates design artifacts only; task generation and implementation remain subsequent phases. |

**Pre-design gate result**: PASS. The spec defines the roles, route name, typed handoff, eight-dispatch ceiling, and request isolation. “Team” is treated as a production graph route selected through existing `POST /chat`, not a new HTTP path.

## Phase 0: Research

See [research.md](./research.md). The design uses a custom LangGraph workflow because role permissions and the exact dispatch limit require deterministic routing. It reuses the project’s model factory, operational tools, pending-action approval flow, request trace contract, and web trace viewer. No unresolved technical choices remain.

## Phase 1: Design & Contracts

- [Data model](./data-model.md): request-local board, role permissions, dispatch budget, pending action, and persisted request/trace additions.
- [Team and chat contract](./contracts/team-mode.md): route selection, supervisor schema, handoff trace, role capabilities, errors, and approval behavior.
- [Quickstart](./quickstart.md): typecheck, tests, build, and end-to-end validation scenarios.

## Project Structure

### Documentation (this feature)

```text
specs/019-team-incident-coordination/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── team-mode.md
└── tasks.md                         # Created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── team/
│   ├── team-mode.ts                 # Team graph, board, supervisor, and role routing
│   └── team-mode.test.ts            # State isolation, role boundaries, and dispatch limit
├── agents/
│   ├── production-graph.ts          # Add the team route to routing and dispatch
│   ├── reasoning.ts                 # Add and validate the handoff trace event
│   ├── index.ts                     # Register team mode with gated operational dependencies
│   ├── production-graph.test.ts     # Automatic/explicit team route coverage
│   └── trace.test.ts                # Shared trace schema coverage
├── contracts/
│   └── war-room.ts                  # Existing request/result contract; no new HTTP path
├── services/
│   └── request-trace-store.ts       # Accept the team route in trace record schemas
├── store/
│   ├── sqlite-request-trace-store.ts       # Versioned compatibility migration
│   └── sqlite-request-trace-store.test.ts  # Preserve old rows and store team/handoff data
├── http/
│   └── server.test.ts               # `/chat` team route and approval response coverage
└── index.ts                          # Existing production dependency wiring

web/src/
├── components/TraceViewer.tsx        # Render the handoff event
├── components/TraceViewer.test.ts    # Verify rendered handoff details
└── trace-view-model.test.ts          # Validate handoff event display data
```

**Structure Decision**: Keep this as one backend/frontend application. Put the request-scoped supervisor and role nodes under the user-requested `src/team/`; register its `ReasoningStrategy` through the existing strategy registry and route to it from the production graph. The existing `/chat` HTTP route remains the boundary, so existing request identity, timeouts, pending-action response, and trace retrieval stay in place. Extend the shared trace union and SQLite store rather than introducing a separate team trace format or API.

## Design Decisions

- Use a custom nested `StateGraph` in `src/team/`, exposed as a `ReasoningStrategy`. Its state contains the original request, current brief, board entries, handoff count, answer/status, and ordered trace events. Create fresh state for every `run`; do not attach a checkpointer or reuse a board across requests.
- Use a strict Zod supervisor schema with exactly `next` and `brief`. `next` is one of `analista`, `planejador`, `executor`, or `done`; `brief` is a non-empty task instruction or final answer. Validate each decision server-side before following it. Emit `{ type: "handoff", from: "supervisor", to: next, brief }` for every decision, including `done`; only role destinations consume the eight-dispatch budget.
- Count a handoff only when the supervisor dispatches to one of the three roles. Emit the event before running that role. Once eight dispatches have occurred, stop with an explicitly incomplete answer rather than dispatching a ninth role. Keep a graph recursion limit as a secondary guard, not as the product-level limit.
- Give the analyst only read-only alert, incident-list, runbook, and provider-status tools and constrain its output to factual observations, not proposals. Its prompt requests firing alerts with date/severity, recent open and resolved incidents, relevant runbooks, provider status, and known team windows/facts, and forbids asserting unobserved data. Give the planner no tools and a structured plan output. Give the executor only incident-scoped tools; mutating tools must be created with `PendingActionService` and may return pending actions, never a direct write path. Do not register an executable team strategy without the approval service.
- Use the existing model factory and structured-output API. Inject model/agent/tool dependencies for tests. Keep each role’s model call and tool output separate in the board; only include safe, concise task briefs and result summaries in the public trace.
- Add `team` to the production route enum and router prompt, strategy registration, route trace schema, and request trace schemas. An explicit `strategy: "team"` bypasses outer automatic routing according to the existing `/chat` contract; automatic routing may also select `team`.
- Extend the typed event union with `handoff` fields `from`, `to`, and `brief`, assign the supervisor node and contiguous sequence, and render those fields in `TraceViewer`. The same event must validate in HTTP responses, frontend view-model parsing, and persisted trace reads.
- The SQLite request and trace tables use closed `CHECK` constraints. Add a transactional schema upgrade that expands the allowed route and event-type values without dropping existing requests or trace events; validate copied rows and retain prepared statements and bound values.
- Preserve existing `200` and `202` chat behavior. Pending incident operations continue through the existing action service and are returned in the existing accepted-response contract; only confirmed outcomes may be described as completed.
- Add no dependencies, new endpoint, new persistence entity, or project boundary.

**Post-design Constitution Check**: PASS. The request board is isolated, not persisted; the HTTP boundary and stores keep their existing responsibilities; all new structured and trace data are schema-validated; executor mutations are approval-gated; SQLite constraints remain closed through a compatibility migration; and the planned test gates match the constitution.

## Complexity Tracking

No constitution violations. A nested graph and one SQLite table rebuild are required by the explicit supervisor/board requirements and existing closed SQLite constraints; no simpler route can preserve the requested role boundaries and typed persisted handoffs.
