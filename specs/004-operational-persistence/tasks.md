---

description: "Task list for persisted operational data and SQLite-backed agent tools"
---

# Tasks: Persistência Operacional

**Input**: Design documents from `specs/004-operational-persistence/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/operational-tools.md`, `quickstart.md`

**Tests**: Required by the feature specification and project constitution. Write tests first and
confirm they fail for the missing behavior before implementing each story.

**Organization**: Tasks are grouped by user story. The user-provided SQLite snippet is illustrative
only: use the current domain's canonical severities (`critical`, `high`, `medium`, `low`) and
incident statuses (`open`, `resolved`), and never concatenate a dynamic `WHERE` clause.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: Parallelizable because it touches a different file and has no unfinished prerequisite.
- **[Story]**: User-story label for story tasks.
- Each task names the file(s) to create or modify.

## Phase 1: Setup

**Purpose**: Keep local database artifacts out of source control and establish the planned store
module location.

- [X] T001 Add `data/` to `.gitignore` so the default SQLite database and its local artifacts are not versioned.

---

## Phase 2: Foundational

**Purpose**: Extend the shared store contract and in-memory adapter before implementing persistent
storage or agent-facing operations.

- [X] T002 [P] Add contract tests for incident `summary`, `listIncidents(status: open | resolved | all)`, and service runbook lookup in `src/services/operational-store.test.ts`.
- [X] T003 Extend the Zod domain schemas and `OperationalStore` contract with nullable incident `summary`, `IncidentFilter`, runbook records, `listIncidents`, and `getRunbook` in `src/services/operational-store.ts`.
- [X] T004 Implement the new incident-list and runbook-lookup contract in the in-memory adapter, preserving deterministic filtering and explicit missing-entity behavior in `src/services/in-memory-operational-store.ts`.

**Checkpoint**: The existing memory adapter and store types support every domain operation required by the persistent adapter; `npm run typecheck` passes.

---

## Phase 3: User Story 1 - Preservar o estado operacional (Priority: P1) 🎯 MVP

**Goal**: Store services, alerts, incidents, and runbooks in a durable database and restore state
after reopening the database.

**Independent Test**: Run the SQLite store tests using `:memory:` and a temporary file; create and
resolve an incident, close and reopen the file-backed store, and verify the records and nullable
fields survive.

### Tests for User Story 1

- [X] T005 [P] [US1] Add tests for in-memory construction, idempotent DDL setup, prepared-filter behavior, incident create/list/resolve, unknown service/incident errors, and file reopen persistence in `src/store/sqlite-ops-store.test.ts`.

### Implementation for User Story 1

- [X] T006 [US1] Implement `SqliteOpsStore` with `DatabaseSync`, parent-directory creation for file paths, idempotent four-table schema, foreign keys, and CHECK constraints for alert status (`firing`, `resolved`), incident status (`open`, `resolved`), and severity (`critical`, `high`, `medium`, `low`) in `src/store/sqlite-ops-store.ts`.
- [X] T007 [US1] Implement typed store reads and writes with prepared statements and bound values only; use separate static prepared statements for `open`, `resolved`, and `all` filters rather than assembling SQL text, and preserve `summary`/`resolvedAt` nullability in `src/store/sqlite-ops-store.ts`.
- [X] T008 [US1] Inject a singleton file-backed `SqliteOpsStore` into the default operational tool composition while keeping `createOperationalTools(store)` injectable for isolated tests in `src/agents/tools.ts`.

**Checkpoint**: `node --import tsx --test src/store/sqlite-ops-store.test.ts` passes, including reopen persistence and invalid-domain CHECK rejection; tools use the durable store by default.

---

## Phase 4: User Story 2 - Iniciar um cenário de demonstração reproduzível (Priority: P1)

**Goal**: Seed the expected Mercadinho scenario idempotently without overwriting operational
incidents, and keep benchmark/test executions isolated.

**Independent Test**: Initialize the same database twice and verify exactly five services, six
alerts split three `firing`/three `resolved`, and one runbook per service `checkout`, `payments`,
and `auth`; confirm no duplicate seed rows and no removed incidents.

### Tests for User Story 2

- [X] T009 [P] [US2] Add tests for exact scenario counts, three firing/three resolved alerts, the checkout/payments/auth runbooks, repeated initialization without duplicate seed rows or lost incidents, and independent `:memory:` scenarios in `src/store/sqlite-ops-store.seed.test.ts`.
- [X] T010 [P] [US2] Verify benchmark scenarios still construct isolated in-memory stores and do not touch the configured persistent database in `src/bench.test.ts`.

### Implementation for User Story 2

- [X] T011 [US2] Replace the current six-service/seven-alert seed with exactly five services and six alerts (three `firing`, three `resolved`), retaining `checkout`, `payments`, and `catalog` for existing benchmark scenarios and adding `auth`, in `src/scripts/demo-data.json`.
- [X] T012 [US2] Define one non-empty, service-specific runbook for each of `checkout`, `payments`, and `auth` with stable IDs, titles, and instructions in `src/scripts/demo-runbooks.ts`.
- [X] T013 [US2] Seed services, alerts, and runbooks transactionally with prepared inserts and conflict handling that leaves incidents and existing operator state intact in `src/store/sqlite-ops-store.ts`.
- [X] T014 [US2] Keep benchmark scenario setup on fresh in-memory stores seeded from the shared five-service/six-alert scenario in `src/bench.ts`.

**Checkpoint**: Repeated seed initialization yields the required counts with no duplicates; benchmark runs remain isolated from the default database.

---

## Phase 5: User Story 3 - Consultar e operar incidentes com o agente (Priority: P1)

**Goal**: Let the agent list incidents by state and retain the existing safe open/resolve behavior.

**Independent Test**: Using an isolated SQLite-backed tool set, open an incident, list by each
filter and by default, resolve it, then verify it appears only in the resolved/all results.

### Tests for User Story 3

- [X] T015 [P] [US3] Add agent-tool tests for `list_incidents` filters `open`, `resolved`, `all`, default `open`, invalid status rejection, and open/resolve persistence using a SQLite `:memory:` store in `src/agents/tools.test.ts`.
- [X] T016 [P] [US3] Add plan-and-execute routing tests proving `list_incidents` validates and invokes the correct operational tool in `src/agents/plan-and-execute.test.ts`.

### Implementation for User Story 3

- [X] T017 [US3] Add the Zod `listIncidentsInputSchema` with `status` values `open`, `resolved`, `all` and default `open`, and expose a result-validated `list_incidents` tool from `createOperationalTools` in `src/agents/tools.ts`.
- [X] T018 [US3] Route `list_incidents` through the plan-and-execute executor using the shared input schema in `src/agents/plan-and-execute.ts`.
- [X] T019 [US3] Extend benchmark tool typing and dispatch to support `list_incidents` without replacing its in-memory store in `src/bench.ts`.

**Checkpoint**: The new tool filters incident records correctly, and ReAct/plan-and-execute expose consistent incident operations.

---

## Phase 6: User Story 4 - Consultar alertas e procedimentos (Priority: P2)

**Goal**: Provide service-specific runbook lookup, preserve alert filtering, and give the agent
complete operational guidance in tool descriptions and field schemas.

**Independent Test**: Query alerts by each status and runbooks for checkout, payments, auth,
unknown services, and services without runbooks; inspect all tool descriptions and field metadata.

### Tests for User Story 4

- [X] T020 [P] [US4] Add tests for `consultar_runbook` service-specific results and explicit unavailable results for unknown services or missing runbooks in `src/agents/tools.test.ts`.
- [X] T021 [P] [US4] Add assertions that every operational tool field has Zod `.describe()` metadata and every tool description covers all six contract rules in `src/agents/tools.test.ts`.
- [X] T022 [P] [US4] Add plan-and-execute routing tests for `consultar_runbook` and retain alert-filter dispatch coverage in `src/agents/plan-and-execute.test.ts`.

### Implementation for User Story 4

- [X] T023 [US4] Add the Zod runbook input schema and result-validated `consultar_runbook` tool returning only the requested service's runbook in `src/agents/tools.ts`.
- [X] T024 [US4] Add `.describe()` metadata to every field of every operational tool schema and revise all tool descriptions to satisfy the six rules in `src/agents/tools.ts`.
- [X] T025 [US4] Route `consultar_runbook` through plan-and-execute using its shared Zod schema in `src/agents/plan-and-execute.ts`.
- [X] T026 [US4] Add runbook tool types and dispatch to benchmark scenarios while retaining isolated in-memory stores in `src/bench.ts`.

**Checkpoint**: Both agent strategies can retrieve the matching runbook and alerts; unknown or missing procedures are explicit and tool guidance satisfies all six criteria.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Document runtime and persistence behavior and run the full validation gates.

- [X] T027 [P] Update `README.md` with SQLite persistence, `OPSPILOT_DB` default path, Node.js 22.13+ prerequisite, seed contents, and in-memory benchmark/test behavior.
- [X] T028 Run the store/tool focused tests, `npm run typecheck`, and `npm test`; resolve failures in the corresponding source/test files and record the successful commands in `specs/004-operational-persistence/quickstart.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No prerequisite.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on the store contract foundation; provides the persistent
  adapter required for story-specific storage tests.
- **User Story 2 (Phase 4)**: Depends on US1 because it seeds and verifies the SQLite store.
- **User Story 3 (Phase 5)**: Depends on US1 for durable incident operations and US2 for the
  shared scenario's known service IDs.
- **User Story 4 (Phase 6)**: Depends on US1 and US2 for persisted runbooks and seeded services;
  it also uses the operational tool factory introduced in US3.
- **Polish (Phase 7)**: Depends on all desired user stories.

### User Story Dependencies

- **US1 (P1)**: Independent after foundational store contract work.
- **US2 (P1)**: Depends on US1's SQLite adapter.
- **US3 (P1)**: Depends on US1 and the known-service scenario from US2.
- **US4 (P2)**: Depends on the adapter and seed from US1/US2; tool descriptions and agent routes
  are sequenced after US3's tool changes.

### Parallel Opportunities

- T002 is parallelizable with T001 because it changes a separate file.
- T009 and T010 are parallelizable because they change separate test files.
- T015 and T016 are parallelizable because they change separate test files.
- T020, T021, and T022 are parallelizable because they change separate test files.
- T027 can be prepared independently of individual tool-source changes, but final validation
  T028 must run after all implementation and documentation tasks.

### Parallel Example: User Story 2

```text
Task T009: Write SQLite seed/idempotence tests in src/store/sqlite-ops-store.seed.test.ts
Task T010: Write isolated benchmark tests in src/bench.test.ts
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and Foundational phases.
2. Implement US1 and verify database reopen persistence, nullable incident fields, filter behavior,
   and CHECK constraints independently.
3. Validate that the default agent composition uses the durable store.

### Incremental Delivery

1. Add US2's repeatable seed and in-memory benchmark isolation.
2. Add US3's incident listing tool and both agent routing paths.
3. Add US4's runbook tool and complete tool descriptions/field metadata.
4. Update the README and run focused tests, typecheck, and full suite.

## Notes

- Keep every statement's SQL text static; query filters use pre-prepared statements with bound
  status values, not a string-built `WHERE` clause.
- CHECK values follow the domain types in `src/services/operational-store.ts`; do not copy the
  illustrative `sev1/sev2/sev3` and `mitigated` values from the supplied sketch.
- The store remains async at the `OperationalStore` interface boundary even though
  `DatabaseSync` performs its work synchronously.
- Do not remove legacy Sequelize/MySQL files as part of this feature.
