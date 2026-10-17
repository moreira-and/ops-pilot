# Tasks: API HTTP do Chat

**Input**: Design documents from `/specs/003-chat-http-api/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chat-http.md

**Tests**: Integration tests are required by the feature specification. Use deterministic fake strategies and do not make network or model calls.

**Organization**: Tasks are grouped by user story to enable independently testable increments.

## Format

Each task uses `- [ ] Tnnn [P?] [USn?] Description` and identifies the exact file path(s) to change or validate. `[P]` appears only when the task can proceed in parallel with other tasks without editing the same files or depending on unfinished work.

## Phase 1: Setup

**Purpose**: Confirm project prerequisites and source layout.

The repository already has the Node.js/TypeScript project, Express, Zod, `node:test` via `tsx`, and the `src/` tree. No setup changes or dependency installation are required.

## Phase 2: Foundational

**Purpose**: Shared blocking infrastructure.

No separate foundational task is needed: this feature adds no shared infrastructure outside its user-story deliverables.

## Phase 3: User Story 1 - Enviar uma mensagem ao agente (Priority: P1) 🎯 MVP

**Goal**: Provide a successful chat request using the default `react` strategy and return the validated result.

**Independent Test**: Send a valid request without `strategy` to an ephemeral local Express server with a deterministic fake registered as `react`; verify status 200, the selected strategy, and the `answer`, `trace`, and `metrics` response fields.

### Tests for User Story 1

- [X] T001 [P] [US1] Add an HTTP integration test for default `react` selection and the 200 result shape using an injected fake strategy in `src/http/server.test.ts`.

### Implementation for User Story 1

- [X] T002 [P] [US1] Export a name-to-`ReasoningStrategy` registry containing the existing `react` and `plan-and-execute` strategies in `src/agents/index.ts`.
- [X] T003 [US1] Create an Express app factory and `POST /chat` route in `src/http/server.ts`; inject the strategy registry, parse requests with Zod, resolve the requested registry entry (default `react`), validate successful results with `reasoningResultSchema`, and return the result as status 200.
- [X] T004 [US1] Start the HTTP app from the existing development entrypoint, listening on `PORT` or 3000 by default, in `src/index.ts`.

**Checkpoint**: The endpoint serves a valid request via the development entrypoint and its default strategy behavior is covered without external services.

## Phase 4: User Story 3 - Receber erros claros para solicitações inválidas ou demoradas (Priority: P1)

**Goal**: Return distinct and explicit responses for invalid input, unknown strategy, execution timeout, and unexpected execution failure.

**Independent Test**: Through the injected app factory, submit invalid bodies, an unknown strategy and a pending fake strategy with a shortened test deadline; verify 400 with Zod issues, 422 without invoking a strategy, and 504 respectively, all without network or model calls.

### Tests for User Story 3

- [X] T005 [US3] Add integration cases for missing and schema-invalid bodies, unknown strategy without invocation, and a deterministic timeout using the app factory's short deadline in `src/http/server.test.ts`.

### Implementation for User Story 3

- [X] T006 [US3] Translate Zod request issues to 400, unknown registry entries to 422, timeout at the configured 180-second production deadline to 504, malformed JSON to 400, and unexpected or invalid strategy results to an explicit 500 response in `src/http/server.ts`.

**Checkpoint**: Every specified invalid or delayed request returns its documented HTTP status and does not appear as a successful chat result.

## Phase 5: User Story 2 - Escolher estratégia e reflexão (Priority: P2)

**Goal**: Select a registered strategy by name and optionally apply reflection without network calls in integration tests.

**Independent Test**: Inject two deterministic strategies and a test reflection decorator, then send requests with an alternate strategy and with `reflact` true/false; verify selection and decorator use.

### Tests for User Story 2

- [X] T007 [US2] Add integration cases for selecting a named alternate strategy, omitting or disabling `reflact`, and enabling it with an injected deterministic reflection decorator in `src/http/server.test.ts`.

### Implementation for User Story 2

- [X] T008 [US2] Add an injectable reflection decorator defaulting to the existing `withReflection` helper in `src/http/server.ts`, and apply it to the selected strategy only when `reflact` is true.

**Checkpoint**: Both registered strategies are selectable, and reflection is applied only when requested.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Confirm the documentation and repository quality gates match the implemented endpoint.

- [X] T009 [P] Update the validation scenarios and expected responses in `specs/003-chat-http-api/quickstart.md` to match the integration tests in `src/http/server.test.ts`.
- [X] T010 Run the focused integration test in `src/http/server.test.ts`, then `npm run typecheck` and `npm test`; resolve any feature-related failures in `src/agents/index.ts`, `src/http/server.ts`, `src/http/server.test.ts`, or `src/index.ts`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No code tasks; project prerequisites already exist.
- **Foundational (Phase 2)**: No separate tasks; no additional shared foundation is necessary.
- **User Story 1 (Phase 3)**: Starts immediately; provides the endpoint and registry that later stories extend.
- **User Story 3 (Phase 4)**: Depends on User Story 1's route and registry.
- **User Story 2 (Phase 5)**: Depends on User Story 1's route and registry.
- **Polish (Phase 6)**: Depends on all selected stories being implemented.

### User Story Dependencies

- **US1 (P1)**: No dependency on other stories; implements the minimum usable successful chat flow.
- **US3 (P1)**: Depends on US1 for the route, request parsing, and strategy lookup to translate failures.
- **US2 (P2)**: Depends on US1 for the route and registry to support named selection and optional reflection.
- **US2 and US3**: Behaviorally independent after US1, though their route changes and integration cases share `src/http/server.ts` and `src/http/server.test.ts`; implement sequentially in this plan to avoid conflicting edits.

### Within Each User Story

- Write and run the story's deterministic integration cases before completing the corresponding implementation.
- Keep the default registry in `src/agents/index.ts`; do not mutate it to enable per-request reflection.
- Keep HTTP validation and status translation in `src/http/server.ts`; do not return strategy failures as status 200.
- Wire listener startup only in `src/index.ts` so importing the app factory does not bind a port.

## Parallel Opportunities

- **US1**: T001 and T002 may proceed in parallel because the fake-strategy HTTP test and default registry edit target different files. T003 follows both.
- **US3**: T005 precedes T006; both touch `src/http/server.test.ts` / `src/http/server.ts` and should not be split into concurrent edits.
- **US2**: T007 precedes T008; both touch the HTTP test and server files and should be done sequentially.
- **Across stories**: US2 and US3 are logically independent after US1, but share the same route and test files, so parallel implementation is not recommended.
- **Polish**: T009 can proceed independently of code validation after the integration behavior has stabilized; T010 runs after implementation and documentation are complete.

## Parallel Example: User Story 1

```text
Task: T001 Add deterministic HTTP integration test in src/http/server.test.ts
Task: T002 Export the strategy registry in src/agents/index.ts
```

Complete T003 and T004 after these independent tasks.

## Implementation Strategy

### MVP First (User Story 1)

1. Complete T001 and T002, then implement T003 and T004.
2. Run the focused integration test in `src/http/server.test.ts`.
3. Stop and validate that default `react` selection returns a valid 200 response without external calls.

### Incremental Delivery

1. Deliver US1 as the successful chat MVP.
2. Add US3 error statuses and deadline behavior, verifying each with deterministic fakes.
3. Add US2 named strategy selection and reflection, verifying the decorator is only applied when requested.
4. Update the quickstart and run `npm run typecheck` and `npm test`.
