# Tasks: Núcleo de raciocínio do OpsPilot

**Input**: Design documents from `specs/001-reasoning-core/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, and `contracts/`

**Tests**: Test tasks are included because FR-013 explicitly requires deterministic store and trace tests and the constitution requires tests for all new behavior. Write the tests before their implementations; run them without OpenRouter or MySQL.

**Organization**: Tasks are grouped by the three prioritized user stories in `spec.md`.

## Format: `[ID] [P?] [Story] Description with file path`

- `[P]` marks tasks that can proceed concurrently without editing the same file or depending on unfinished work.
- Story tasks use `[US1]`, `[US2]`, or `[US3]`; Setup, Foundational, and Polish tasks have no story label.
- Every task names its target source, test, config, or documentation file.

## Phase 1: Setup

**Purpose**: Install the maintained integration packages and document environment keys without replacing existing local configuration.

- [X] T001 Update `package.json` and `package-lock.json` to use the provided `@langchain/openai`/LangGraph example and add `mysql2` plus `umzug`; replace Sequelize's unsupported MySQL driver `mysql` with `mysql2`.
- [X] T002 [P] Add placeholder database settings `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` to `.env.example`; preserve existing entries and do not add real credentials.

## Phase 2: Foundational

**Purpose**: Define the contracts, database connection, and persistence model/migration foundation required by every user story.

**⚠️ CRITICAL**: Complete this phase before starting user-story implementation.

- [X] T003 [P] Define Zod schemas and TypeScript types for reasoning input, positive `maxIterations`, strategy result, ordered trace event kinds, action tool/arguments, and metrics `llmCalls`/`latencyMs` in `src/agents/reasoning.ts`.
- [X] T004 [P] Implement environment-based Sequelize/MySQL connection configuration with explicit missing-setting errors and a closable process-scoped connection in `src/models/database.ts`.
- [X] T005 [P] Define operational service, alert, and incident schemas/types, store port, and explicit domain errors in `src/services/operational-store.ts` and `src/services/domain-error.ts`; require non-empty service IDs/names and incident titles, alert status `firing | resolved`, incident status `open | resolved`, and severity `critical | high | medium | low`.
- [X] T006 Create Sequelize models for services, alerts, and incidents plus the versioned migration runner and initial non-destructive table migration in `src/models/service.ts`, `src/models/alert.ts`, `src/models/incident.ts`, `src/migrations/runner.ts`, and `src/migrations/001-create-operational-tables.ts`; encode the foreign-key relationships and nullable `resolvedAt` rule from `data-model.md`.

## Phase 3: User Story 1 - Investigar alertas e incidentes (Priority: P1) 🎯 MVP

**Goal**: Let an operator query firing/resolved alerts and open or resolve incidents using validated tools backed by the seeded in-memory records.

**Independent Test**: With deterministic injected storage and model doubles, query each alert status, open an incident for an existing service, resolve it, and verify invalid input or unknown records produce explicit errors rather than success-shaped results. Run the JSON seed command and confirm the demonstration data counts without a database.

### Tests for User Story 1

- [X] T007 [P] [US1] Write deterministic CRUD, filtering, unknown-service/incident, and repeated-resolution tests for the operational store port in `src/services/operational-store.test.ts`.
- [X] T008 [P] [US1] Write tool schema and execution tests for invalid status, non-empty title, existing service, allowed severity values, and explicit failures in `src/agents/tools.test.ts`.
- [X] T009 [P] [US1] Write pure seed-data tests asserting six services and seven alerts, including catalog, with four `firing` and three `resolved` in `src/scripts/demo-data.test.ts`.
- [X] T010 [P] [US1] Write offline model-factory configuration tests asserting missing `OPENROUTER_API_KEY` or `OPENROUTES_MODEL` fails explicitly and configured construction uses temperature zero in `src/agents/model.test.ts`.
- [X] T011 [P] [US1] Write controlled-model ReAct tests for alert lookup, incident tool execution, answer shape, and max-iteration termination in `src/agents/react.test.ts`.

### Implementation for User Story 1

- [X] T012 [P] [US1] Implement an isolated in-memory operational store satisfying the shared store port, enforcing service foreign-key checks and incident state transitions, in `src/services/in-memory-operational-store.ts`.
- [X] T013 [P] [US1] Implement a Sequelize-backed operational store for listing/upserting services and alerts and creating/resolving incidents in `src/services/sequelize-operational-store.ts`; preserve unrelated rows and never delete incidents.
- [X] T014 [P] [US1] Implement alert query and alert-result validation in `src/services/alert-service.ts`, filtering only by the requested `firing | resolved` status.
- [X] T015 [P] [US1] Implement incident opening and resolution in `src/services/incident-service.ts`; require an existing service, non-empty title, severity `critical | high | medium | low`, start new incidents as `open`, and transition only `open -> resolved`.
- [X] T016 [P] [US1] Define stable demonstration records for six services and seven alerts, including catalog (four `firing` and three `resolved`), in `src/scripts/demo-data.json`; reuse stable IDs and never include incident records.
- [X] T017 [US1] Implement `npm run seed:demo` through `src/scripts/seed-demo.ts` and `package.json`; validate the JSON fixture and load only demonstration services/alerts into an in-memory store without requiring database configuration.
- [X] T018 [P] [US1] Implement the single OpenRouter model factory in `src/agents/model.ts` using `OPENROUTER_API_KEY`, `OPENROUTES_MODEL`, temperature zero, the maintained OpenRouter integration, and explicit missing-configuration errors without logging secrets.
- [X] T019 [P] [US1] Implement shared per-run metrics and model-invocation counting in `src/agents/metrics.ts`; count each actual model call including retries and failures exactly once by model run ID, and measure whole-run elapsed milliseconds monotonically.
- [X] T020 [US1] Implement Zod-validated `list_alerts`, `open_incident`, and `resolve_incident` model tools in `src/agents/tools.ts`, delegating to the corresponding services and returning explicit tool errors.
- [X] T021 [US1] Implement the prebuilt ReAct strategy in `src/agents/react.ts` using the provided LangGraph `createReactAgent` API, injected model/tools, shared result contract, typed action/observation/answer events, actual LLM-call metrics, and the configured iteration bound.

**Checkpoint**: User Story 1 works independently: deterministic tool/store tests and controlled ReAct tests pass without external services; the seed command populates MySQL when configured.

## Phase 4: User Story 2 - Entender como a estratégia chegou à resposta (Priority: P2)

**Goal**: Provide complete, safe, ordered trace formatting and a plan-and-execute strategy that exposes planning, execution, replanning, metrics, and bounded completion.

**Independent Test**: Run both strategies with scripted models and isolated storage; verify all trace kinds/order, exact model-call accounting, no more than one executed plan step per cycle, no plans over eight steps, preservation of completed steps across replanning, and termination at the configured iteration limit.

### Tests for User Story 2

- [X] T022 [P] [US2] Write deterministic trace-formatting tests for all six event types, tool/argument display, event order, and safe handling of special characters in `src/agents/trace.test.ts`.
- [X] T023 [P] [US2] Write Plan-and-Execute graph tests using scripted model/tool doubles for structured plans, one step per cycle, replanning, completed-step preservation, no remaining work, the eight-step ceiling, model-call counts, and iteration termination in `src/agents/plan-and-execute.test.ts`.
- [X] T024 [P] [US2] Extend ReAct scripted-model tests to verify complete ordered traces, invocation counts including failures/retries, and termination at `maxIterations` in `src/agents/react.test.ts`.

### Implementation for User Story 2

- [X] T025 [P] [US2] Implement pure formatting and normalization helpers for `thought`, `action`, `observation`, `plan`, `critique`, and `answer` events in `src/agents/trace.ts`; include tool-call IDs and validated/redacted arguments, and never expose hidden chain-of-thought.
- [X] T026 [US2] Integrate graph/model/tool lifecycle events with the shared ordered trace helpers in `src/agents/react.ts`, preserving action results/errors and final answers without fabricating events.
- [X] T027 [US2] Implement Plan-and-Execute as an explicit LangGraph in `src/agents/plan-and-execute.ts` with structured Zod-validated planner/replanner outputs, at most eight stable-ID steps, one tool step per cycle, preserved completed results, no-work termination, bounded iterations, and shared trace/metrics output.

**Checkpoint**: Both strategies meet the shared result contract, provide ordered safe traces and accurate metrics, and stop within their iteration/plan bounds.

## Phase 5: User Story 3 - Comparar estratégias na arena (Priority: P3)

**Goal**: Let an operator run selected strategies against the same input with a validated iteration limit and separately labeled outputs.

**Independent Test**: Run the arena with injected strategies and a fixed input; verify all selected strategies receive the same text and bound, execute in requested order, print separate answers/traces/metrics, and reject invalid arguments before model or database construction.

### Tests for User Story 3

- [X] T028 [P] [US3] Write CLI parser and arena-runner tests for required non-empty input, default and selected strategies, duplicate/unknown strategy rejection, positive integer limits, common input, execution order, and isolated strategy failures in `src/arena.test.ts`.

### Implementation for User Story 3

- [X] T029 [US3] Implement Zod-validated `--input`, `--strategies`, and `--max-iterations` parsing, sequential execution of selected strategies on the same input, explicit failure reporting, and per-strategy answer/trace/metrics output in `src/arena.ts`.

**Checkpoint**: The arena rejects invalid options before initializing integrations and prints an identifiable result for every selected strategy.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the documented workflows and quality gates without exposing secrets or hiding integration failures.

- [X] T030 [P] Update `specs/001-reasoning-core/quickstart.md` to match the implemented seed and arena commands, environment variables, and expected outcomes.
- [X] T031 Run `npm run typecheck` and `npm test`; fix any feature regressions in the relevant `src/**/*.ts` files and confirm all offline tests pass.
- [X] T032 Execute `npm run seed:demo` and verify the JSON fixture loads six demonstration services and seven demonstration alerts split four `firing`/three `resolved` into the in-memory store; surface validation failures explicitly rather than reporting a successful seed.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately; dependency installation and environment-example update edit separate files and can run in parallel.
- **Foundational (Phase 2)**: Begins after Setup. T003, T004, and T005 are independent; T006 depends on database configuration and entity/store types.
- **User Story 1 (Phase 3)**: Begins after the foundation. Tests T007-T011 can be authored in parallel. Store adapters T012-T013, services T014-T015, seed data T016, model factory T018, and metrics T019 target separate files once their shared contracts are ready. Tools T020 depend on the services; ReAct T021 depends on tools, model construction, metrics, and shared schemas. Seed command T017 depends on the models/migration runner and seed data.
- **User Story 2 (Phase 4)**: Depends on User Story 1 because it extends the ReAct trace and shares its model, tool, store, and metrics contracts. Tests T022-T024 can be authored in parallel; trace implementation T025 precedes ReAct trace integration T026, while Plan-and-Execute T027 uses the same shared contracts.
- **User Story 3 (Phase 5)**: Depends on User Stories 1 and 2 so both selectable strategies exist. Write T028 before implementing the arena in T029.
- **Polish (Phase 6)**: Depends on all three stories; execute typecheck/tests and then the database seed verification.

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on another story; delivers the operational tools, seeded in-memory store, demo seed, and ReAct MVP.
- **User Story 2 (P2)**: Depends on User Story 1 to enrich ReAct traces and provide the shared tools/model/metrics; adds Plan-and-Execute.
- **User Story 3 (P3)**: Depends on User Stories 1 and 2 because the arena selects and compares their strategy implementations.

### Parallel Opportunities

- Setup tasks T001 and T002 can run together.
- Foundational tasks T003-T005 can run together; T006 follows them.
- User Story 1 test tasks T007-T011 can be written in parallel. After interfaces exist, T012-T016, T018, and T019 can be implemented concurrently where their files do not overlap. The services (T014-T015) and stores (T012-T013) each target distinct files.
- User Story 2 tests T022-T024 can run together. T025 must precede T026; T027 can proceed alongside those if it does not modify `trace.ts` or `react.ts`.
- User Story 3 has one test task followed by its arena implementation.

### Parallel Example: User Story 1

```text
Write T007 store tests, T008 tool tests, T009 seed-data tests,
T010 model-factory tests, and T011 ReAct tests in parallel.

After the shared contracts are ready, implement T012 in
src/services/in-memory-operational-store.ts, T013 in
src/services/sequelize-operational-store.ts, T014 in
src/services/alert-service.ts, T015 in
src/services/incident-service.ts, T016 in src/scripts/demo-data.ts,
T018 in src/agents/model.ts, and T019 in src/agents/metrics.ts
as independent file-scoped tasks.
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Setup and the Foundational phase.
2. Complete User Story 1, including offline tests, validated tools, ReAct, and the repeatable JSON seed command.
3. Validate all US1 tests without network access; run the JSON seed without external services.
4. Stop at the US1 checkpoint for a usable operational-investigation MVP.

### Incremental Delivery

1. Setup + Foundation → shared schemas and operational store adapters.
2. User Story 1 → operational tools, in-memory JSON seed, and ReAct MVP.
3. User Story 2 → auditable traces, accurate metrics, and Plan-and-Execute.
4. User Story 3 → validated strategy-comparison arena.
5. Polish → strict typecheck, full test suite, and requested seed execution.

## Notes

- `[P]` indicates separate-file work with no unfinished prerequisites; do not parallelize tasks that edit the same file.
- Every story-specific task is labeled with its corresponding `[USn]`; Setup, Foundational, and Polish tasks intentionally have no story label.
- Test tasks are intentionally listed before their corresponding implementations.
- The seed updates only stable demo IDs and must not drop schema or remove/overwrite unrelated operational records.
- Iterations are decision cycles; count actual model invocations separately. A Plan-and-Execute cycle executes no more than one step and the total completed plus pending steps across all replans is limited to eight.
