# Tasks: Trace Persistido e Logs JSON

**Input**: Design documents from `/specs/015-persisted-trace/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Tests are required by Constitution Principle IV and use `node:test` via `tsx`.

**Organization**: Tasks are grouped by the three user stories from `spec.md`. The project and test runner already exist, so no dependency or project initialization is needed.

## Phase 1: Setup

**Purpose**: Reuse the existing TypeScript, Zod, SQLite, Express and test configuration.

No setup tasks are needed; the project already has the required runtime and test scripts.

---

## Phase 2: Foundational

**Purpose**: Establish typed persistence contracts, the SQLite adapter and dependency injection before story implementation.

- [X] T001 [P] Define Zod schemas and `RequestTraceStore` contracts in `src/services/request-trace-store.ts`; preserve request constraints: `id` is a generated UUID and primary key, `userId` is non-empty, `route` is a supported production route or null on early failure, `modelUsed` is a non-empty model ID or null, `promptTokens` is a non-negative integer or null, `latencyMs` is non-negative or null, `status` is `running` during processing and `ok` or `failed` when terminal, `startedAt` is required, `completedAt` is null only while running, and `errorCode` is sanitized. Define trace event fields `requestId`, non-negative `sequence`, non-empty `node`, supported `type`, full event `payload`, and `createdAt`.
- [X] T002 [P] Add `RequestNotFoundError` to `src/services/domain-error.ts` for lookups with no matching request.
- [X] T003 Add SQLite request lifecycle tests using `DatabaseSync(":memory:")` in `src/store/sqlite-request-trace-store.test.ts`; cover record creation, terminal status, persisted metrics, and reopen durability.
- [X] T004 Implement idempotent `requests` and `trace_eventos` tables and prepared store operations in `src/store/sqlite-request-trace-store.ts`; use `DatabaseSync`, bound values, foreign keys, status checks for `running`/`ok`/`failed`, and `(requestId, sequence)` uniqueness.
- [X] T005 Inject the request-trace store into `createApp` with an in-memory default and persistent `OPSPILOT_DB` wiring from `src/index.ts`.

**Checkpoint**: Request and event contracts, SQLite persistence and application injection are ready.

---

## Phase 3: User Story 1 - Correlacionar uma solicitação de chat (Priority: P1) 🎯 MVP

**Goal**: Assign an ID to every accepted chat, return it in the body and `X-Request-Id`, and persist request metrics/outcome.

**Independent Test**: Send two valid `/chat` requests and verify each response body ID equals its header and is unique.

### Tests for User Story 1

- [X] T006 [P] [US1] Add service tests for unique request IDs and successful/failed request lifecycle persistence in `src/services/request-trace-service.test.ts`.
- [X] T007 [P] [US1] Add HTTP and graph tests for matching body/header IDs, distinct requests, request ID propagation into graph state, and final request metrics persisted before return in `src/http/server.test.ts` and `src/agents/production-graph.test.ts`.

### Implementation for User Story 1

- [X] T008 [US1] Implement request ID generation and start/success/failure orchestration in `src/services/request-trace-service.ts`; persist available metrics and sanitized error status through `RequestTraceStore`.
- [X] T009 [US1] Integrate the request lifecycle into `POST /chat` in `src/http/server.ts` and `src/agents/production-graph.ts`; set `X-Request-Id`, return the same ID in the body, propagate it to graph state, and persist the final `userId`, route, `modelUsed`, `promptTokens`, `latencyMs` and `status: "ok"` from the response node. Add a current model-usage snapshot in `src/agents/model-usage.ts` so the final metrics and fallback events are present before persistence.

**Checkpoint**: Chat execution IDs and request-level metrics are returned and persisted.

---

## Phase 4: User Story 2 - Consultar registro e trace de uma execução (Priority: P1)

**Goal**: Persist the final request and each trace event, then retrieve the matching record and ordered trace.

**Independent Test**: Complete a fake chat with multiple events, query its ID, verify record/metrics/event order, and confirm an unknown ID returns 404.

### Tests for User Story 2

- [X] T010 [P] [US2] Add SQLite tests for trace payload round-trip, request isolation and stable sequence ordering when timestamps match in `src/store/sqlite-request-trace-store.test.ts`.
- [X] T011 [P] [US2] Add HTTP tests for `GET /requests/:id` success, ordered trace, and unknown-ID 404 in `src/http/server.test.ts`.

### Implementation for User Story 2

- [X] T012 [US2] Persist each validated trace event and its complete payload in `trace_eventos` from `src/store/sqlite-request-trace-store.ts`; atomically save request metrics/status and events, and query only the requested ID ordered by sequence.
- [X] T013 [US2] Implement request retrieval and not-found translation in `src/services/request-trace-service.ts`; validate the reconstructed record and trace with Zod.
- [X] T014 [US2] Add `GET /requests/:id` with validated output and 404 mapping in `src/http/server.ts`.

**Checkpoint**: Each request's persisted record and trace are independently retrievable in order.

---

## Phase 5: User Story 3 - Investigar eventos sem expor conteúdo operacional (Priority: P2)

**Goal**: Emit one JSON line per log event with metadata and request correlation, excluding messages, answers, payloads and secrets.

**Independent Test**: Emit a log event containing metadata and sensitive test values; verify one valid JSON line with the ID and without those values.

### Tests for User Story 3

- [X] T015 [P] [US3] Add logger tests for one JSON line per event, allowed metadata and exclusion of message, answer, payload and secret fields in `src/obs/logger.test.ts`.
- [X] T016 [P] [US3] Add request lifecycle log tests for `requestId` correlation and absence of chat/trace content in `src/services/request-trace-service.test.ts`.

### Implementation for User Story 3

- [X] T017 [US3] Implement an allowlisted JSON-lines logger with an injectable writer in `src/obs/logger.ts`; do not accept or serialize arbitrary trace/result objects.
- [X] T018 [US3] Emit start, completion and failure metadata from `src/services/request-trace-service.ts` using the logger; include `requestId` when available and never pass chat content, trace payloads, raw errors or stacks.

**Checkpoint**: Lifecycle events are correlated while emitted logs contain only metadata.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature and keep the acceptance guide aligned.

- [X] T019 Run `npm run typecheck` and `npm test`; update expected commands or outcomes in `specs/015-persisted-trace/quickstart.md` if implementation requires it.

---

## Dependencies & Execution Order

```text
T001 ──┬──> T003 ──> T004 ──> T005 ──> T006 ──┐
       │                                     ├──> T008 ──> T009
T002 ──┘                               T007 ─┘

T009 ──┬──> T010 ──┐
       └──> T011 ──┴──> T012 ──> T013 ──> T014
                                      │
                                      └──> T016 ──> T018
T009 ──> T015 ──┐
                 └──> T017 ───────────────────> T018

T014 ──┐
       ├──> T019
T018 ──┘
```

- User Story 1 depends on the foundational persistence and injection tasks.
- User Story 2 depends on User Story 1's request IDs and request records.
- User Story 3 depends on User Story 1's request IDs. Its service integration follows the User Story 2 service work to avoid concurrent edits to `request-trace-service.ts`.

### Parallel Opportunities

- `T001` and `T002` touch separate files.
- `T006` and `T007` are independent tests in separate files.
- `T010` and `T011` are independent SQLite and HTTP tests.
- `T015` and `T016` are independent logger and service tests.

### Parallel Example: User Story 1

```text
Task: T006 service lifecycle tests in src/services/request-trace-service.test.ts
Task: T007 HTTP correlation tests in src/http/server.test.ts
```

### Parallel Example: User Story 2

```text
Task: T010 SQLite trace tests in src/store/sqlite-request-trace-store.test.ts
Task: T011 retrieval tests in src/http/server.test.ts
```

### Parallel Example: User Story 3

```text
Task: T015 logger tests in src/obs/logger.test.ts
Task: T016 request lifecycle logging tests in src/services/request-trace-service.test.ts
```

## Implementation Strategy

1. Complete the foundational tasks and User Story 1 as the MVP.
2. Verify body/header ID equality and request-level persistence before continuing.
3. Add User Story 2 retrieval and trace persistence.
4. Add User Story 3 metadata-only JSON logging.
5. Run both project quality gates and the quickstart scenarios.

## Notes

- `[P]` tasks touch different files and have no dependency on unfinished work.
- Every task uses the required checkbox, sequential ID, optional parallel marker, story label where applicable, and concrete file path.
- Tests precede implementation for each user story and use deterministic fakes or an in-memory database.
