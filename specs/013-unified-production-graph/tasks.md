# Tasks: Grafo unificado de produção

**Input**: Design documents from `specs/013-unified-production-graph/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/production-graph.md`

**Tests**: Included because the specification requires deterministic verification and the project constitution mandates tests for every new behavior.

**Organization**: Tasks are grouped by the three independently verifiable user stories from `spec.md`. Shared trace and route schemas are foundational prerequisites.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with another marked task because they change separate files and have no unfinished task dependency.
- **[Story]**: User-story label (`US1`, `US2`, or `US3`).
- Every task includes its target file path.

## Phase 1: Setup

**Purpose**: Project initialization.

No project setup or dependency changes are required. The existing TypeScript project, LangGraph dependencies, Zod schemas, and `node:test` commands cover this feature.

---

## Phase 2: Foundational

**Purpose**: Establish the shared trace and route types that all user stories depend on.

- [X] T001 Extend `traceEventSchema` and `TraceEvent` in `src/agents/reasoning.ts` with the required `node` field on every event and a `route` event variant containing the closed route enum, non-empty reason, and `router` or `override` source.

**Checkpoint**: Shared route and trace contracts are defined; existing strategy event producers are normalized in the trace-focused story before feature validation.

---

## Phase 3: User Story 1 - Receber uma resposta pela estratégia adequada (Priority: P1)

**Goal**: Route a context-enriched request to exactly one supported strategy and return its result through the existing chat API.

**Independent Test**: Use deterministic router decisions and fake strategies to verify each of the three routes returns only its selected strategy result; verify router or strategy failures do not produce success-shaped results.

### Tests for User Story 1

- [X] T002 [P] [US1] Add deterministic graph tests for each route, one selected strategy per run, invalid router decisions, and route/strategy failures in `src/agents/production-graph.test.ts`.
- [X] T003 [P] [US1] Add HTTP tests proving a request without `strategy` uses automatic routing and returns the selected result or an explicit failure in `src/http/server.test.ts`.

### Implementation for User Story 1

- [X] T004 [US1] Implement the context and structured router nodes, route prompt table, model-factory integration, router-call counter, and conditional route mapping in `src/agents/production-graph.ts`.
- [X] T005 [US1] Add named strategy delegates for `react`, `plan-and-execute`, and `reflect:react`, plus the response node that returns the selected answer, trace, and combined metrics in `src/agents/production-graph.ts`.
- [X] T006 [US1] Connect the production graph to `createApp` and `createChatService` so an omitted `strategy` is routed automatically while existing request, conversation, context, timeout, and response behavior is preserved in `src/http/server.ts`.

**Checkpoint**: Automatic routing provides a complete response through `/chat` and can be verified without network access.

---

## Phase 4: User Story 2 - Entender o caminho até a resposta (Priority: P1)

**Goal**: Make route, graph, strategy, and chat-service events identifiable and ordered in the returned trace.

**Independent Test**: Run all three graph paths with deterministic components and verify the `route` event includes route, reason, and source; every event has its producer node; event sequence numbers are contiguous and ordered.

### Tests for User Story 2

- [X] T007 [US2] Add trace assertions for route-event contents, node attribution for every existing event type, contiguous sequence numbers, a single final answer event, and context-summary events in `src/agents/production-graph.test.ts` and `src/http/server.test.ts`.

### Implementation for User Story 2

- [X] T008 [P] [US2] Attribute existing reasoning events to their owning strategy nodes in `src/agents/react.ts`, `src/agents/plan-and-execute.ts`, and `src/agents/reflection.ts`, preserving each event's existing type-specific fields.
- [X] T009 [P] [US2] Normalize combined graph and strategy traces in `src/agents/production-graph.ts`: add generic context and route events, set strategy and response node identifiers, ensure one final answer event, and assign contiguous sequence numbers without exposing full context.
- [X] T010 [P] [US2] Add `node: "context"` to context-summary trace events and keep the appended event sequence valid in `src/services/chat-service.ts`.

**Checkpoint**: Successful `/chat` traces identify the decision, event ownership, and event order across graph, strategy, and chat-service output.

---

## Phase 5: User Story 3 - Sobrescrever a seleção automática no chat (Priority: P2)

**Goal**: Let callers choose a supported strategy explicitly and make that override visible without invoking automatic model routing.

**Independent Test**: Submit each supported strategy explicitly; verify the selected strategy alone runs, the router is not called, and the route trace records `source: override`. Verify an unknown strategy is rejected before execution and the legacy `reflact` option does not double-wrap `reflect:react`.

### Tests for User Story 3

- [X] T011 [US3] Add HTTP tests for explicit strategy overrides, router bypass, unknown-strategy rejection before chat mutation, override trace source, and `reflact` compatibility in `src/http/server.test.ts`.

### Implementation for User Story 3

- [X] T012 [US3] Validate optional `strategy` against the three graph routes, pass it as an override, preserve the existing 422 error shape, and avoid applying Reflection twice for `reflect:react` in `src/http/server.ts`.
- [X] T013 [US3] Ensure the graph records explicit selections with a user-safe reason and `source: "override"` without invoking the router in `src/agents/production-graph.ts`.

**Checkpoint**: Explicit strategy selection preserves the caller's choice and leaves an auditable override event in the same trace contract.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Keep existing API references aligned and run the complete verification gates.

- [X] T014 Update the existing chat HTTP contracts to document optional automatic routing, supported explicit routes, and node-aware trace events in `specs/003-chat-http-api/contracts/chat-http.md` and `specs/007-conversation-persistence/contracts/chat-http.md`.
- [X] T015 Run the deterministic scenarios and quality gates documented in `specs/013-unified-production-graph/quickstart.md`, including `npm run typecheck` and `npm test`; resolve any regressions in the touched source and test files.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No code or dependency setup is needed.
- **Foundational (Phase 2)**: T001 defines the shared Zod trace/route contract and blocks all story work.
- **User Stories (Phases 3-5)**: Each story depends on T001 and is sequenced by the graph-to-trace-to-HTTP integration path.
- **Polish (Phase 6)**: Depends on the desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after T001. Establishes the production graph and automatic chat path.
- **User Story 2 (P1)**: Starts after User Story 1 because it normalizes events emitted by the selected graph and strategies.
- **User Story 3 (P2)**: Starts after User Story 2 because the override must be recorded in the finalized route and node-aware trace contract.

### Within Each User Story

- Write the story's deterministic tests before its implementation tasks.
- For User Story 1, T002 and T003 can run in parallel; graph tests and HTTP tests use separate files.
- For User Story 2, T008, T009, and T010 can run in parallel after T007 because they change separate source files.
- For User Story 3, complete T011 before implementing T012 and T013; T012 must precede T013 if they are executed serially because the HTTP adapter passes the override into the graph.
- Complete each story checkpoint before proceeding to the next story phase.

## Parallel Execution Examples

### User Story 1

```text
Task: T002 Add deterministic production-graph tests in src/agents/production-graph.test.ts
Task: T003 Add automatic-routing HTTP tests in src/http/server.test.ts
```

### User Story 2

```text
Task: T008 Add node attribution to strategy events in src/agents/react.ts, src/agents/plan-and-execute.ts, and src/agents/reflection.ts
Task: T009 Normalize graph events in src/agents/production-graph.ts
Task: T010 Attribute context-summary events in src/services/chat-service.ts
```

### User Story 3

```text
Task: T011 Add strategy-override HTTP tests in src/http/server.test.ts
```

## Implementation Strategy

### MVP First (User Story 1)

1. Define the shared route and node-aware trace schema in T001.
2. Complete the graph and HTTP tests in T002-T003.
3. Implement routing, strategy delegation, and automatic `/chat` routing in T004-T006.
4. Validate the P1 automatic response and explicit failure behavior independently.

### Incremental Delivery

1. Complete T001 and User Story 1 to deliver automatic routing to the three strategies.
2. Complete User Story 2 to make the combined route and execution trace fully attributable.
3. Complete User Story 3 to deliver caller-controlled route overrides.
4. Update existing API references and run full project quality gates.
