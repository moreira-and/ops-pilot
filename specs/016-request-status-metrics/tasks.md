# Tasks: Métricas Agregadas de Solicitações

**Input**: Design documents from `/specs/016-request-status-metrics/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Tests are required by Constitution Principle IV and use `node:test` via `tsx`.

**Organization**: Tasks are grouped by the two user stories from `spec.md`. The project and test runner already exist, so no dependency or project initialization is needed.

## Phase 1: Setup

**Purpose**: Reuse the existing TypeScript, Express, Zod, SQLite and `node:test` configuration.

No setup tasks are needed; the application and test runner already exist.

---

## Phase 2: Foundational

**Purpose**: Collect input/output token usage and add it to existing request persistence without losing prior database records.

- [X] T001 [P] Add tests for prompt/completion token extraction from `LLMResult.llmOutput.tokenUsage` and `generations[0][0].message.usage_metadata` in `src/agents/metrics.test.ts`.
- [X] T002 [P] Add tests that ReAct, reflection and the production router preserve and sum `completionTokens` in `src/agents/react.test.ts`, `src/agents/reflection.test.ts` and `src/agents/production-graph.test.ts`.
- [X] T003 [P] Add a migration test that opens a legacy `requests` schema, preserves old rows, and returns `completionTokens: null` for them in `src/store/sqlite-request-trace-store.test.ts`.
- [X] T004 Implement output token extraction and per-run summation in `src/agents/metrics.ts`, and add optional non-negative integer `completionTokens` to `reasoningMetricsSchema` in `src/agents/reasoning.ts`; preserve existing `promptTokens`.
- [X] T005 Propagate `completionTokens` through ReAct, reflection and router/strategy metric aggregation in `src/agents/react.ts`, `src/agents/reflection.ts` and `src/agents/production-graph.ts`.
- [X] T006 Add nullable `completionTokens` to request schemas and completion contracts in `src/services/request-trace-store.ts` and `src/services/request-trace-service.ts`; preserve the data-model rule “nullable para provedores ou registros antigos sem uso”, bind/read it during SQLite completion and retrieval, migrate `requests` additively, preserve `prompt_tokens`, add nullable `completion_tokens`, and create an index on `started_at` in `src/store/sqlite-request-trace-store.ts`.

**Checkpoint**: New requests persist both token directions; existing request rows remain readable.

---

## Phase 3: User Story 1 - Acompanhar métricas recentes (Priority: P1) 🎯 MVP

**Goal**: Return overall counts, errors, tokens, estimated cost and p50/p95 for a validated time window.

**Independent Test**: Query a deterministic 24-hour dataset with successful, failed and running requests; verify all overall metrics, empty-window behavior and HTTP 400 for invalid `since`.

### Tests for User Story 1

- [X] T007 [P] [US1] Add service tests for the default `24h` window, inclusive boundaries, running/error counts, missing token usage, nearest-rank percentiles and empty windows in `src/services/request-status-service.test.ts`.
- [X] T008 [P] [US1] Add HTTP tests for `GET /status`, default and explicit `since`, invalid-duration 400, response validation and empty-window output in `src/http/server.test.ts`.
- [X] T009 [P] [US1] Add store tests that select only requests with `startedAt >= from` and `startedAt <= to`, including both boundary rows, in `src/store/sqlite-request-trace-store.test.ts`.

### Implementation for User Story 1

- [X] T010 [P] [US1] Define and validate `ModelPrice` plus the injectable local price table in `src/services/model-pricing.ts`: `modelId` is exact, non-empty and unique; `inputUsdPerMillion` and `outputUsdPerMillion` are finite non-negative USD rates; IDs ending in `:free` cost zero; absent rates or tokens yield unavailable cost; do not invent paid-model rates.
- [X] T011 [P] [US1] Add a typed status-request projection and prepared inclusive time-window query to `RequestTraceStore` in `src/services/request-trace-store.ts` and `src/store/sqlite-request-trace-store.ts`; bind both timestamps and map nullable token, route and model fields.
- [X] T012 [US1] Implement `since` parsing and overall aggregation in `src/services/request-status-service.ts`: positive `m`/`h`/`d` duration, default `24h`, window `from`/`to`, total, failed count, known input/output sums, nullable total tokens when usage is incomplete, `costUnavailableRequests`, `unpricedRequests`, local-table cost and nearest-rank terminal latency percentiles.
- [X] T013 [US1] Add `GET /status` to `src/http/server.ts`; validate query and output with Zod, default missing `since` to `24h`, return HTTP 400 for invalid duration, inject the local model-price table into the status service, and preserve explicit HTTP errors for store failures.

**Checkpoint**: The endpoint returns a validated overall summary without grouping.

---

## Phase 4: User Story 2 - Comparar rotas e modelos (Priority: P2)

**Goal**: Include the same metrics grouped independently by route and effective `modelUsed`, preserving null-key groups.

**Independent Test**: Query requests spread across multiple routes and models, including missing route/model values; verify each group's counts and metrics are isolated and deterministically ordered.

### Tests for User Story 2

- [X] T014 [P] [US2] Add service tests for `byRoute` and `byModel`, null-key groups, cost availability, token completeness and deterministic lexical ordering in `src/services/request-status-service.test.ts`.
- [X] T015 [P] [US2] Add HTTP contract tests for `byRoute` and `byModel` group shapes, null keys and aggregate parity in `src/http/server.test.ts`.

### Implementation for User Story 2

- [X] T016 [US2] Extend `src/services/request-status-service.ts` and its Zod response schema to calculate the full aggregate per route and `modelUsed`, with `costUnavailableRequests`, `unpricedRequests`, null-key groups and null-first lexical ordering; preserve request-level token attribution to its effective model.

**Checkpoint**: Both aggregate and grouped views agree on the same window and calculation rules.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Keep the acceptance guide aligned and validate the feature with project quality gates.

- [X] T017 Update `specs/016-request-status-metrics/quickstart.md` and `specs/016-request-status-metrics/contracts/status.md` to reflect the final implemented response and any clarified outcomes.
- [X] T018 Run `npm run typecheck` and `npm test`; resolve failures related to this feature and confirm the quickstart scenarios in `specs/016-request-status-metrics/quickstart.md`.

---

## Dependencies & Execution Order

```text
T001 -> T004 -> T005 -> T006
T002 -------> T005
T003 -----------------> T006
T006 -> T007 -> T010 -> T012 -> T013
T007 -----------------> T012
T006 -> T008 -----------------> T013
T006 -> T009 -> T011 -> T012
T013 -> T014/T015 -> T016 -> T017 -> T018
```

- User Story 1 depends on foundational token collection and backward-compatible request-store migration.
- User Story 2 extends the service and endpoint delivered by User Story 1; it depends on T013.
- T010 and T011 are independent implementations after their related tests; T012 uses both and T007.

### Parallel Opportunities

- Foundational tests T001, T002 and T003 touch separate test files.
- User Story 1 tests T007, T008 and T009 touch service, HTTP and SQLite test files.
- User Story 1 implementations T010 and T011 touch separate files and can proceed in parallel after the related tests.
- User Story 2 tests T014 and T015 touch service and HTTP tests.

### Parallel Example: User Story 1

```text
Task: T007 service aggregation tests in src/services/request-status-service.test.ts
Task: T008 HTTP contract tests in src/http/server.test.ts
Task: T009 SQLite time-window query tests in src/store/sqlite-request-trace-store.test.ts
```

### Parallel Example: User Story 2

```text
Task: T014 grouped service tests in src/services/request-status-service.test.ts
Task: T015 grouped HTTP response tests in src/http/server.test.ts
```

## Implementation Strategy

1. Complete foundational token accounting and the additive SQLite migration.
2. Deliver User Story 1 as the MVP: overall summary, cost availability and percentiles.
3. Validate totals and error behavior independently before adding groups.
4. Deliver User Story 2 with route/model groups and deterministic null-key handling.
5. Update the quickstart and run both project quality gates.

## Notes

- `[P]` tasks touch different files and have no dependency on unfinished work.
- Story tasks include the `[US1]` or `[US2]` label and all tasks include concrete file paths.
- Tests precede implementation for each behavior, as required by Constitution Principle IV.
- Paid model rates must be explicitly configured; tasks must not invent production prices.
