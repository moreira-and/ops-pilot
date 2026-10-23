# Tasks: Learning Reflector

**Input**: Design documents from `/specs/009-learning-reflector/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Tests are included because the project constitution requires tests for every new behavior and the plan specifies deterministic coverage.

**Organization**: Tasks are grouped by user story to support incremental implementation and verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it uses a different file and has no dependency on incomplete tasks.
- **[Story]**: User story label from `spec.md` (`US1`, `US2`, `US3`).
- Every task includes the exact source or test file path.

## Phase 1: Setup

**Purpose**: Reuse existing model, memory, and SQLite dependencies; no new package or database setup is needed.

No setup tasks are required. The project already provides `ChatOpenAI.withStructuredOutput`, the user-scoped `MemoryStore`, and in-memory SQLite tests.

---

## Phase 2: Foundational

**Purpose**: Preserve the existing chat, memory, and agent boundaries. No schema migration or shared infrastructure task blocks the user stories.

No foundational tasks are required; user story work can start using the existing service and store interfaces.

---

## Phase 3: User Story 1 - Aprender fatos duráveis (Priority: P1) 🎯 MVP

**Goal**: After a successful answer, asynchronously extract at most one explicit, durable fact from only the latest user message and remember it for the same user without delaying the response.

**Independent Test**: With injected extraction and memory dependencies, verify eligible facts are remembered for the request user, ineligible outputs are ignored, older turns and assistant text are not extracted, and an unresolved extraction/write does not block the chat response.

### Tests for User Story 1

- [X] T001 [P] [US1] Add `src/services/learning-service.test.ts` cases for structured eligible/no-learning results, blank or invalid facts, latest-message-only extraction input, and calls to `remember` only for eligible output.
- [X] T002 [P] [US1] Add `src/services/chat-service.test.ts` cases proving learning is scheduled only after a successful assistant append, receives the current message and `userId`, and does not delay the returned chat result when extraction remains pending.

### Implementation for User Story 1

- [X] T003 [US1] Implement the Zod-validated `{ hasLearning, fact }` extractor, `withStructuredOutput` prompt, injectable model/extractor and memory dependencies, and eligible-fact persistence through `MemoryStore.remember` in `src/services/learning-service.ts`.
- [X] T004 [US1] Extend `createChatService` to schedule the learning service only after successful strategy completion and assistant-message persistence, using only the current request message and `userId`; attach explicit sanitized failure logging without awaiting the background operation in `src/services/chat-service.ts`.
- [X] T005 [US1] Wire a shared production `MemoryStore` and learning service into the chat application without changing test injection behavior in `src/index.ts`, `src/http/server.ts`, and `src/agents/index.ts`.

**Checkpoint**: A durable fact from a successful chat can be learned for its owner; learning does not block or revise the completed response.

---

## Phase 4: User Story 2 - Proteger informações secretas (Priority: P1)

**Goal**: Prevent source messages or extracted facts containing recognizable credentials and secrets from being persisted or written to logs.

**Independent Test**: Feed password, token, private-key, credential-marker, and mixed durable-fact/secret examples through the learning boundary; verify no secret-bearing candidate reaches `remember` or logs.

### Tests for User Story 2

- [X] T006 [P] [US2] Add `src/services/memory-safety.test.ts` cases for common password/token/private-key formats, secret text embedded in otherwise durable facts, safe ordinary preferences, and fail-closed handling.

### Implementation for User Story 2

- [X] T007 [US2] Implement a deterministic, conservative secret detector that returns only a boolean and never exposes matched values in `src/services/memory-safety.ts`.
- [X] T008 [US2] Apply the detector to both source messages and extracted facts before persistence, fail closed for secret-like input, and keep source/fact contents out of learning failure logs in `src/services/learning-service.ts` and `src/services/chat-service.ts`.

**Checkpoint**: Secret-like content is rejected before memory persistence, including when mixed with a durable fact.

---

## Phase 5: User Story 3 - Esquecer uma preferência (Priority: P2)

**Goal**: Let the current user ask the agent to remove one clearly identified learned preference; refuse to delete on weak or ambiguous matching and never accept owner identity from model arguments.

**Independent Test**: With an in-memory `MemoryStore` and injected identity context, verify a unique high-confidence preference is deleted for its owner, another user's memory remains untouched, and ambiguous/no-match requests delete nothing.

### Tests for User Story 3

- [X] T009 [P] [US3] Add `src/services/preference-forget-service.test.ts` cases for unique match deletion, recall/forget scoping by `userId`, minimum score `0.75`, lead margin `0.10`, ambiguity, no match, and propagated store failures.
- [X] T010 [P] [US3] Add `src/agents/tools.test.ts` cases confirming `forget_preference` exposes only a non-empty `preference` input, rejects missing/invalid trusted context, and maps deleted/not-found/ambiguous outcomes without claiming false success.
- [X] T011 [P] [US3] Add `src/agents/react.test.ts` and `src/agents/plan-and-execute.test.ts` coverage that invocation identity is passed out of band and cannot be overridden by model-visible tool arguments.

### Implementation for User Story 3

- [X] T012 [US3] Implement a preference-forget service that recalls at most three same-user candidates, deletes at most one only when its score is at least `0.75` and its lead over other candidates above `0.3` is at least `0.10`, returns `ambiguous` or `not_found` without mutation otherwise, and propagates storage failures in `src/services/preference-forget-service.ts`.
- [X] T013 [US3] Add a `forget_preference` LangChain tool with a Zod-validated non-empty `preference` input, obtain the owner only from validated LangGraph runtime context, and return structured deleted/not-found/ambiguous results in `src/agents/tools.ts`.
- [X] T014 [US3] Extend ReAct strategy construction and invocation to include the memory-aware tool and typed per-request context schema, passing trusted `userId` out-of-band rather than through the prompt or tool arguments in `src/agents/react.ts`.
- [X] T015 [US3] Propagate the validated request `userId` through chat strategy invocation and reflection wrappers without adding it to model-visible prompt text in `src/services/chat-service.ts`, `src/http/server.ts`, `src/agents/reflection.ts`, and `src/agents/reasoning.ts`.
- [X] T016 [US3] Wire the production `forget_preference` tool to the same persistent `MemoryStore` used for recall and learning, while preserving per-request identity isolation in `src/index.ts`, `src/agents/index.ts`, and `src/agents/plan-and-execute.ts`.

**Checkpoint**: The agent can forget one clearly matching preference for the current user; ambiguous, missing, and cross-user requests do not delete or reveal other users' records.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the feature against its design, preserve existing behavior, and update its runnable guide.

- [X] T017 [P] Update `specs/009-learning-reflector/quickstart.md` with final test names, manual asynchronous-learning timing expectations, and the implemented forget-tool behavior.
- [X] T018 Run the focused tests from `specs/009-learning-reflector/quickstart.md`, then `npm run typecheck` and `npm test`; fix feature-related failures in the affected `src/services/`, `src/agents/`, `src/http/`, and `src/index.ts` files.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks; existing project dependencies and persistence are reused.
- **Foundational (Phase 2)**: No tasks; existing service/store boundaries are sufficient.
- **User Story 1 (Phase 3)**: Can start immediately; establishes asynchronous learning.
- **User Story 2 (Phase 4)**: Depends on the learning service in US1 so the detector can guard the actual persistence boundary.
- **User Story 3 (Phase 5)**: Depends on the existing memory store; can be implemented after or alongside US1/US2, but production wiring is completed after those service dependencies exist.
- **Polish (Phase 6)**: Depends on all selected stories being implemented.

### User Story Dependencies

- **US1 (P1)**: Independent MVP; uses the existing memory store.
- **US2 (P1)**: Extends US1's extractor-to-persistence path with the mandatory secret safety gate.
- **US3 (P2)**: Uses existing recall/forget operations and trusted per-invocation context; does not depend on the extractor behavior, but full production wiring shares the memory store setup.

### Within Each User Story

- Write deterministic tests before their corresponding implementation.
- Keep secret detection before any `remember` call.
- Keep tool ownership sourced from runtime context and validated before memory lookup.
- Do not mark a story complete until its independent test criteria pass.

### Parallel Opportunities

- T001 and T002 touch separate test files and can be authored in parallel.
- T006 is independent of US1 test work, but detector integration (T008) must follow both US1's extractor and detector implementation.
- T009, T010, and T011 target distinct test files and can be authored in parallel.
- US3 service/tool implementation is independent of secret detector implementation once the existing `MemoryStore` contract is available.
- T017 can be prepared alongside final implementation, but T018 must run after all selected feature tasks.

## Parallel Example: User Story 1

```text
Task: T001 tests for the learning service in src/services/learning-service.test.ts
Task: T002 async chat integration tests in src/services/chat-service.test.ts
```

## Parallel Example: User Story 3

```text
Task: T009 forget service tests in src/services/preference-forget-service.test.ts
Task: T010 tool contract tests in src/agents/tools.test.ts
Task: T011 runtime identity tests in src/agents/react.test.ts
```

## Implementation Strategy

1. **MVP**: Complete US1 to learn durable facts asynchronously after successful chat responses.
2. **Safety gate**: Complete US2 before enabling learned-memory persistence in a production release; no release should persist candidates without the deterministic secret check.
3. **User control**: Complete US3 to add safe `forget_preference` behavior with trusted identity context.
4. **Validation**: Update the quickstart, run targeted tests, then typecheck and the full suite.

The MVP milestone is US1's durable-fact flow, but production rollout must include US2's secret guard.
