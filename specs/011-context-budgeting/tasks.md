---

description: "Task list for feature implementation"
---

# Tasks: Context Budgeting

**Input**: Design documents from `/specs/011-context-budgeting/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Included because FR-009 and FR-010 explicitly require automated tests.

**Organization**: Tasks are grouped by the three user stories so each behavior can be implemented and verified incrementally.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes a different file and has no incomplete-task dependency.
- **[Story]**: The user story this task serves (US1, US2, or US3).
- Every task includes the exact file path(s) to change or validate.

## Phase 1: Setup

**Purpose**: Make the selected tokenizer an explicit dependency and document its optional configuration.

- [X] T001 [P] Run `npm install js-tiktoken` to add the direct tokenizer dependency and update `package.json` and `package-lock.json`.
- [X] T002 [P] Document the optional JSON `CONTEXT_BUDGET` setting and default section limits in `.env.example` without changing any existing environment values.

## Phase 2: Foundational

**Purpose**: Establish the shared context-building module and the validated budget configuration needed by all user stories.

- [X] T003 Create `src/context/context-builder.ts` with the shared context and budget types, defaults (summary 200, history 1,200, memories 300), strict JSON configuration parsing, and a typed error for malformed JSON, unknown keys, or non-negative-integer violations.

**Checkpoint**: Shared context types and deterministic budget defaults are available before story implementation.

## Phase 3: User Story 1 - Preserve essential context across strategies (Priority: P1) 🎯 MVP

**Goal**: Ensure the common context-building path preserves the full latest user message and does not alter strategy-specific system instructions.

**Independent Test**: Build and send chat context through the shared strategy-dispatch path; verify the latest message remains complete and each strategy's existing system instructions remain separate and unchanged.

### Tests for User Story 1

- [X] T004 [US1] Add unit tests for unchanged latest-message preservation and stable rendering of summary, memories, and chronological history in `src/context/context-builder.test.ts`.

### Implementation for User Story 1

- [X] T005 [US1] Implement the pure prompt renderer and unchanged latest-message handling in `src/context/context-builder.ts`, keeping strategy-specific system prompts outside the built user context.
- [X] T006 [US1] Route `composeStrategyInput` through the shared renderer in `src/services/chat-service.ts` and add a service test in `src/services/chat-service.test.ts` proving the prompt uses the builder while the original message is what gets persisted.
- [X] T007 [US1] Add assertions in `src/agents/react.test.ts` and `src/agents/plan-and-execute.test.ts` proving ReAct system instructions remain separate and unchanged and Plan-and-Execute receives the composed context as its user task.

**Checkpoint**: Chat context is built through one shared module, while system instructions and the complete current request remain protected.

## Phase 4: User Story 2 - Keep useful history and memories within limits (Priority: P1)

**Goal**: Enforce independent token ceilings and the specified reduction order for summaries, recent history, and scored memories.

**Independent Test**: Provide oversized sections with low configured ceilings; confirm every rendered section fits, the oldest whole messages and lowest-scoring whole memories are removed first, and summary text is clipped at a token boundary.

### Tests for User Story 2

- [X] T008 [US2] Add tests in `src/context/context-builder.test.ts` for defaults, partial JSON overrides, invalid configuration, exact rendered-section token ceilings, summary prefix clipping, oldest-history removal, lowest-score memory removal, and stable ties.

### Implementation for User Story 2

- [X] T009 [US2] Implement `cl100k_base` token counting and section reduction in `src/context/context-builder.ts`, counting full rendered sections including headings and separators; trim summary to a verified token-safe prefix, drop oldest whole history messages, and drop lowest-score whole memories while retaining the remaining input order.

**Checkpoint**: Summary, history, and memory sections independently respect configured/default budgets with deterministic cuts.

## Phase 5: User Story 3 - Verify budget behavior deterministically (Priority: P2)

**Goal**: Prove low-budget behavior is consistent across the supported chat strategies without external providers.

**Independent Test**: Run HTTP chat tests with fake strategies for every registered strategy name and low injected budgets; verify section limits, cut order, complete latest messages, and unchanged strategy-specific system prompts without network access.

### Tests for User Story 3

- [X] T010 [US3] Add HTTP integration tests in `src/http/server.test.ts` that dispatch identical oversized context through fake implementations for `react`, `plan-and-execute`, and both reflection wrappers, verifying common low-budget cuts without provider calls.
- [X] T011 [US3] Add tests in `src/http/server.test.ts` proving invalid `CONTEXT_BUDGET` configuration is reported explicitly and low configured budgets do not truncate the original latest message persisted by chat.

### Implementation for User Story 3

- [X] T012 [US3] Initialize and validate the environment budget at the application boundary, inject the resolved budget into the shared chat-context builder through `src/http/server.ts`, and expose only a typed budget override for deterministic tests.

**Checkpoint**: Every registered strategy uses the same constrained user context; invalid configuration fails explicitly and no provider access is needed for tests.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete implementation and keep the runnable guide accurate.

- [X] T013 Run the focused context-builder, chat-service, and HTTP tests in `specs/011-context-budgeting/quickstart.md`, plus the ReAct and Plan-and-Execute tests in `src/agents/react.test.ts` and `src/agents/plan-and-execute.test.ts`; fix failures in the corresponding test or implementation files.
- [X] T014 Run `npm run typecheck` and `npm test` as defined in `package.json`; fix any feature-related failures in the affected TypeScript files under `src/`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No prerequisites; T001 and T002 can run in parallel.
- **Foundational (Phase 2)**: T003 depends on T001 because the context module imports the directly declared tokenizer dependency; it blocks all user-story work.
- **User Stories (Phase 3+)**: US1 starts after T003. US2 depends on US1's shared rendering/integration seam. US3 depends on US2's complete budget behavior.
- **Polish (Phase 6)**: Depends on the desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: Starts after the foundation; provides the shared chat context-building seam. MVP is independently testable.
- **US2 (P1)**: Depends on US1 because its budget rules extend the shared renderer.
- **US3 (P2)**: Depends on US2 because it verifies configured limits across strategy dispatch.

### Within Each User Story

- Add story-specific tests before implementing the behavior they verify.
- Keep the core builder as the single owner of formatting, token counting, and reduction logic.
- Run the focused tests for the story before moving to the next story.

## Parallel Execution Examples

### Setup

```text
T001 and T002 can run in parallel (package manifest/lockfile vs. environment example).
```

### User Story 1

```text
After T003: run T004 before T005 because the test and implementation use the same module;
then complete T006 to verify the service integration.
```

### User Story 2

```text
T008 and T009 touch related context-builder files; implement them sequentially, with T008 tests first.
```

### User Story 3

```text
T010 and T011 both touch src/http/server.test.ts and must be serialized, followed by T012
in src/http/server.ts. There are no parallel tasks in this story after the setup phase.
```

## Implementation Strategy

1. Complete setup and the shared foundation.
2. Deliver **US1 as the MVP**: use one prompt builder, protect the latest message, and preserve separate strategy system prompts.
3. Add US2 to enforce defaults, environment overrides, exact token ceilings, and the correct history/memory cut order.
4. Complete US3 with provider-free coverage across all supported strategies and explicit invalid-configuration behavior.
5. Run the quickstart checks, `npm run typecheck`, and `npm test`.
