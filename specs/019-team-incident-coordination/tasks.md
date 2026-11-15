# Tasks: Team Incident Coordination

**Input**: Design documents from `specs/019-team-incident-coordination/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/team-mode.md](./contracts/team-mode.md), [quickstart.md](./quickstart.md)

**Tests**: Tests are included because the project constitution requires tests for every new behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and validation. Test tasks precede their corresponding implementation.

## Phase 1: Setup

**Purpose**: Project initialization and shared setup.

The existing TypeScript, LangGraph, Zod, React, Vite, and `node:test` dependencies and scripts already cover this feature. No package or project initialization changes are required.

## Phase 2: Foundational

**Purpose**: Test and add shared route/trace support while preserving existing persisted data.

- [X] T001 [P] Add failing tests for the `team` route and `handoff` event schemas in `src/agents/production-graph.test.ts` and `src/agents/trace.test.ts`.
- [X] T002 [P] Add a legacy-database migration test in `src/store/sqlite-request-trace-store.test.ts` that seeds old request/trace rows, then asserts those rows remain readable and a `team` request with a `handoff` event round-trips.
- [X] T003 Add the `team` route to the production route enum, automatic router choices, and graph dispatch map in `src/agents/production-graph.ts`.
- [X] T004 Add the typed `handoff` variant to `traceEventSchema` in `src/agents/reasoning.ts`, with `sequence` as a non-negative integer, `node: "supervisor"`, `type: "handoff"`, `from: "supervisor"`, `to` in `analista | planejador | executor | done`, and a non-empty `brief`.
- [X] T005 Add a transactional SQLite compatibility upgrade in `src/store/sqlite-request-trace-store.ts` so `requests.route` accepts `team` and `trace_eventos.type` accepts `handoff`, preserving all existing requests and trace events and retaining closed `CHECK` constraints.

**Checkpoint**: Route and handoff schemas are validated, and existing SQLite data survives the schema upgrade.

## Phase 3: User Story 1 - Coordenar uma investigação de incidente (Priority: P1)

**Goal**: Coordinate a request through a request-local shared board and return a final or explicitly incomplete response.

**Independent Test**: Select the `team` route in injected graph/HTTP tests and confirm it returns a response or explicit failure; force more than eight role dispatches and confirm a ninth dispatch never occurs.

### Tests

- [X] T006 [P] Add failing team graph tests in `src/team/team-mode.test.ts` for request isolation, supervisor decisions, ordered `handoff` events, `done` termination, malformed output, and the eight-role-dispatch ceiling.
- [X] T007 [P] Add failing production-graph and HTTP integration tests in `src/agents/production-graph.test.ts` and `src/http/server.test.ts` for automatic route selection and explicit `strategy: "team"` on `POST /chat`.

### Implementation

- [X] T008 Define `TeamExecution` and `BoardEntry` schemas and types in `src/team/team-mode.ts`. Preserve the data-model rules verbatim: `requestId` “Reuses the chat request ID when available; identifies the trace and approval proposals”; `input` “Non-empty, validated request text”; `board` “Initialized empty for each invocation; not shared across requests”; `handoffs` “Starts at zero; counts supervisor dispatches to a role; range 0–8”; `answer` “Final user-facing answer, or explicit incomplete/failure result”; `trace` “Ordered, schema-validated events for this request”. `BoardEntry.role` is `analista | planejador | executor | supervisor` (“Closed role set identifying the producer”); `kind` is `observations | plan | operation` (“Identifies the kind of content”); `content` is “Non-empty summary or validated result; no unvalidated tool arguments”; `status` is `complete | pending | blocked | failed` (“Distinguishes confirmed, awaiting approval, blocked, and failed work”).
- [X] T009 Define and validate the supervisor structured-output schema in `src/team/team-mode.ts`: `next` is `analista | planejador | executor | done` (“Closed enum; `done` terminates the workflow”); `brief` is “Trimmed and non-empty; task instruction for a role or the final answer when `next` is `done`”. Emit a `handoff` event for every decision with `from: "supervisor"`, `to: next`, and `brief`.
- [X] T010 Implement the request-scoped team `StateGraph` in `src/team/team-mode.ts`. Count only role destinations as handoffs; terminate on `done`, and stop with an explicitly incomplete result rather than dispatching a ninth role.
- [X] T011 Register the team strategy through `src/agents/index.ts` and connect it to the production route in `src/agents/production-graph.ts`, preserving request context, trace normalization, and model metrics.

**Checkpoint**: The team route can be exercised independently with injected roles and returns a bounded, validated result.

## Phase 4: User Story 2 - Preservar os limites de cada papel (Priority: P1)

**Goal**: Enforce role capabilities in tool configuration and ensure incident mutations cannot bypass approval.

**Independent Test**: Invoke each role with fake tools; confirm the analyst has only read-only capabilities and does not propose actions, the planner receives no tools, and the executor has only incident-scoped tools whose mutations remain pending until explicitly approved.

### Tests

- [X] T012 [P] Add failing role-capability tests in `src/team/team-mode.test.ts` proving the analyst cannot invoke mutation tools, the planner invokes no tools, and the executor cannot access non-incident tools.
- [X] T013 [P] Add a failing approval integration test in `src/http/server.test.ts` proving an executor mutation returns HTTP 202 and does not modify incident state before the existing approval endpoint confirms it.

### Implementation

- [X] T014 Configure the analyst in `src/team/team-mode.ts` with only read-only alert, incident-list, runbook, and provider-status tools. Use the requested Portuguese factual prompt: list firing alerts with date/severity, recent open and resolved incidents, relevant runbooks, provider status, and known team windows/facts; require terse bullets, skepticism, and no proposals or operations.
- [X] T015 Configure the planner in `src/team/team-mode.ts` to return an ordered plan without receiving or invoking tools.
- [X] T016 Configure the executor in `src/team/team-mode.ts` with only incident-scoped tools and wire them through `PendingActionService` in `src/agents/index.ts`. Preserve the existing action rules verbatim: `pending` means “Executor proposed an operation; chat may return HTTP 202”; `processing` means “Existing decision service is handling an approval”; `approved` means “Operation was authorized; report completion only after a confirmed result”; `denied` means “Operation was rejected; do not retry or report success”; `failed` means “Authorized operation failed; report failure”; `reconciliation_required` means “Outcome is uncertain; do not retry or claim completion”. Never expose a direct mutation path.

**Checkpoint**: Role permissions are enforced by tool availability; executor mutations use only the existing approval flow.

## Phase 5: User Story 3 - Inspecionar transições entre papéis (Priority: P2)

**Goal**: Render each validated supervisor decision from the response’s own trace in “Ver raciocínio”.

**Independent Test**: Render a response containing a handoff and confirm `from`, `to`, and `brief` appear in order; an unavailable or mismatched trace must not show another request’s events.

### Tests

- [X] T017 [P] Add failing handoff rendering and request-identity tests in `web/src/components/TraceViewer.test.ts` and `web/src/trace-view-model.test.ts`.

### Implementation

- [X] T018 Render `handoff` events in `web/src/components/TraceViewer.tsx`, showing `from`, `to` (including `done`), and the safe brief while preserving trace order.

**Checkpoint**: Operators can inspect the supervisor’s handoffs, including terminal `done`, without seeing events from another request.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Run all required quality gates and keep the validation guide aligned with the implementation.

- [X] T019 Run `npm run typecheck`, `npm test`, and `npm run build:web`; record the verified commands and outcomes in `specs/019-team-incident-coordination/quickstart.md`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No initialization work is needed; the existing project configuration is reused.
- **Foundational (Phase 2)**: T001 and T002 can run in parallel. T003 and T004 follow their failing tests; T005 depends on T003 and T004. The phase blocks user-story implementation so the new route/event can be validated and persisted safely.
- **User Stories (Phase 3+)**: All depend on Phase 2.
- **Polish (Phase 6)**: Depends on the desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Phase 2; no dependency on another user story.
- **User Story 2 (P1)**: Depends on User Story 1’s team graph and role-runner interface.
- **User Story 3 (P2)**: Depends on the foundational handoff schema; its viewer implementation can proceed independently of User Story 2 after Phase 2.

### Within Each User Story

- Add failing graph/HTTP tests before the corresponding coordinator implementation.
- Implement the team state schema before the supervisor and graph.
- Complete the team strategy before registering it in the production strategy registry.
- Add failing permission/approval tests before role tool configuration.
- Do not enable incident mutations before the approval-gated executor path is complete.

### Dependency Graph

```text
T001 ─┐
      ├─> T003/T004 ─> T005 ─┬─> US1: T006/T007 -> T008 -> T009 -> T010 -> T011
T002 ─┘                      ├─> US2: T012/T013 -> T014 -> T015 -> T016 (after US1)
                             └─> US3: T017 -> T018
US1 + US2 + US3 ─────────────────> T019
```

## Parallel Opportunities

- **Foundational**: T001 and T002 are independent failing tests in separate files; T003 and T004 are separate implementations after the tests are written.
- **User Story 1**: T006 (team graph tests) and T007 (production graph/HTTP tests) can be authored in parallel; implementation proceeds after both expose the missing behavior.
- **User Story 2**: T012 and T013 can be authored in parallel; analyst, planner, and executor implementation tasks are sequential because they share `src/team/team-mode.ts`.
- **User Story 3**: T017’s viewer and view-model tests can be authored in parallel with each other and before T018.
- **Story-level**: User Story 3 can proceed in parallel with User Story 2 after the foundational phase and the trace event schema are available.

## Parallel Execution Examples

### Foundational failing tests

```text
Task T001: Test the team route in src/agents/production-graph.test.ts and handoff schema in src/agents/trace.test.ts
Task T002: Test legacy trace database upgrade in src/store/sqlite-request-trace-store.test.ts
```

### User Story 1 failing integration tests

```text
Task T006: Test coordinator decisions in src/team/team-mode.test.ts
Task T007: Test routing and POST /chat in src/agents/production-graph.test.ts and src/http/server.test.ts
```

### User Story 2 failing permission tests

```text
Task T012: Test role tool boundaries in src/team/team-mode.test.ts
Task T013: Test approval-gated operations in src/http/server.test.ts
```

## Implementation Strategy

### Safe MVP

1. Complete the foundational route, trace, and SQLite compatibility work.
2. Complete User Story 1 to deliver a bounded team response.
3. Complete User Story 2 before enabling the team route for production incident mutations; this P1 story is a safety requirement, not optional polish.
4. Validate User Stories 1 and 2 independently before enabling the route in the production router.

### Incremental Delivery

1. Complete setup (no dependency changes) and the shared foundation.
2. Implement and independently test User Story 1.
3. Add and independently test User Story 2; do not deploy mutating executor capabilities before this story is complete.
4. Add and independently test User Story 3’s trace rendering.
5. Run all quality gates and the quickstart validation.
