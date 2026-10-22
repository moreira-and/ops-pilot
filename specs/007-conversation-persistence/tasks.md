# Tasks: Persistent Conversations

**Input**: Design documents from `/specs/007-conversation-persistence/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chat-http.md, quickstart.md

**Tests**: Included because the feature request explicitly calls for `:memory:` and fake-based tests.

**Organization**: Tasks are grouped by the three prioritized user stories in `spec.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with another task in the same phase because it edits a separate file and has no unfinished dependency.
- **[Story]**: User-story mapping for tasks in a story phase.
- All task descriptions identify the source, test, or design file they affect.

## Path Conventions

- Single backend service: application and colocated tests live under `src/`; feature design files live under `specs/007-conversation-persistence/`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The existing TypeScript project, SQLite dependency, and test runner already satisfy the feature prerequisites; no package or project-bootstrap changes are needed.

No setup tasks.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the shared persistence boundary and prove the SQLite adapter's behavior before integrating any user story.

**⚠️ CRITICAL**: Complete this phase before starting user-story work.

- [X] T001 Define conversation/message schemas, `ConversationStore` operations (`create`, `append`, `lastMessages`), and explicit missing-conversation error handling in `src/services/conversation-store.ts` and `src/services/domain-error.ts`. Preserve the data-model constraints: `id` is required, unique, and opaque; `createdAt` is required; `sequence` is a required monotonically increasing integer; `conversationId` is required and references an existing conversation; `role` is `user` or `assistant`; and `content` is required and non-empty after trimming.
- [X] T002 Write in-memory SQLite store tests in `src/store/sqlite-conversation-store.test.ts` for conversation creation, appending valid roles, chronological retrieval of the most recent 12 messages, unknown versus empty conversations, and rejection of invalid role/content or orphan messages. Use a fresh `:memory:` database.
- [X] T003 Implement `SqliteConversationStore` in `src/store/sqlite-conversation-store.ts` with conversation and message tables, a foreign key, a closed role constraint (`user` or `assistant`), non-empty trimmed content, a monotonic sequence, prepared statements with bound values, and `lastMessages` semantics that return at most 12 chronological messages or `null` for an unknown conversation.

**Checkpoint**: The store contract and adapter work in isolation; user-story work can begin.

---

## Phase 3: User Story 1 - Retomar uma conversa (Priority: P1) 🎯 MVP

**Goal**: Continue an existing conversation, include no more than its 12 latest earlier messages in the strategy input, and persist completed interaction messages.

**Independent Test**: Pre-create a conversation, send a chat request with its ID, and verify the selected strategy receives prior messages in chronological order, the same conversation remains active, and the new interaction can be retrieved afterward.

### Tests for User Story 1

- [X] T004 [P] [US1] Write fake-store and fake-strategy tests in `src/services/chat-service.test.ts` for history composition, the 12-message limit, chronological order, appending the current user message and successful assistant answer, and failure propagation.
- [X] T005 [P] [US1] Write HTTP tests in `src/http/server.test.ts` for continuing a supplied conversation ID, preserving that ID in the success response, returning 404 for an unknown ID, and returning no success-shaped body after persistence errors.

### Implementation for User Story 1

- [X] T006 [US1] Implement `ChatService` in `src/services/chat-service.ts` to load a supplied conversation's recent messages, compose role-labeled history with the current user message, invoke the selected strategy, and append the user and validated assistant messages through `ConversationStore`. Keep strategy input compatible with the existing string-based `ReasoningStrategy`.
- [X] T007 [US1] Integrate `ChatService` and the store port into `POST /chat` in `src/http/server.ts`; validate `conversationId`, preserve strategy/reflection selection and timeout behavior, map missing conversations to 404, and return the active conversation ID only with a validated successful result.

**Checkpoint**: A pre-existing conversation can be resumed and tested independently with a fake store and strategy.

---

## Phase 4: User Story 2 - Iniciar uma conversa (Priority: P1)

**Goal**: Start a conversation without an ID, return the newly created ID, and use it for later continuation.

**Independent Test**: Make two chat requests without IDs and verify distinct returned IDs; continue one returned ID and verify it retrieves only that conversation's messages.

### Tests for User Story 2

- [X] T008 [US2] Add fake-store HTTP tests in `src/http/server.test.ts` for creating a conversation when `conversationId` is omitted, returning its ID, and assigning distinct IDs to independent starts.

### Implementation for User Story 2

- [X] T009 [US2] Extend `ChatService` in `src/services/chat-service.ts` to create a conversation when no ID is supplied, and wire `SqliteConversationStore` into the production application in `src/index.ts` while using the configured `OPSPILOT_DB` path.

**Checkpoint**: A client can start a conversation, retain its returned ID, and resume it in a later request.

---

## Phase 5: User Story 3 - Verificar o uso do histórico (Priority: P2)

**Goal**: Expose an accurate `historyMessages` metric for the number of prior messages used in the composed strategy input.

**Independent Test**: For histories containing 0, 1, 12, and more than 12 messages, verify the response metric equals the number included in the prompt and never exceeds 12.

### Tests for User Story 3

- [X] T010 [US3] Add HTTP response tests in `src/http/server.test.ts` asserting `metrics.historyMessages` for empty, partial, exactly-12, and over-12 histories.

### Implementation for User Story 3

- [X] T011 [US3] Extend the chat success-response Zod schema and response construction in `src/http/server.ts` to include integer `metrics.historyMessages` from 0 to 12, counted at the history-composition boundary and excluding the current message and generated answer.

**Checkpoint**: The count reported to clients exactly reflects the messages included in the composed context.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify all stories together and keep the feature documentation aligned with its final contract.

- [X] T012 Run the focused scenarios and full quality gates from `specs/007-conversation-persistence/quickstart.md`; ensure `npm run typecheck` and `npm test` pass, then reconcile any contract or data-model details in `specs/007-conversation-persistence/contracts/chat-http.md` and `specs/007-conversation-persistence/data-model.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No project bootstrap is necessary; the current project configuration is reused.
- **Foundational (Phase 2)**: Starts immediately; T001 precedes the adapter tests and implementation, and T002 must fail before T003 completes the adapter.
- **User Stories (Phase 3+)**: All depend on the store contract and adapter from Phase 2. Tests within User Story 1 can be authored in parallel; implementation proceeds sequentially because the service and HTTP boundary are shared.
- **Polish (Phase 6)**: Depends on all selected stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Depends only on Phase 2; resumes a conversation prepared through the store.
- **User Story 2 (P1)**: Depends on the chat orchestration and HTTP boundary from User Story 1; adds the no-ID creation flow and production store wiring.
- **User Story 3 (P2)**: Depends on the history composition from User Story 1 and new conversation path from User Story 2; exposes and verifies the metric.

### Within Each User Story

- Write tests before implementing the behavior they assert; verify the tests fail for the missing behavior.
- Complete the service behavior before wiring its HTTP response.
- Keep error translation and successful response validation at the HTTP boundary.

### Parallel Opportunities

- After T001, T002 must run before T003 because the adapter tests are intended to prove the SQLite implementation.
- In User Story 1, T004 and T005 edit separate test files and can be authored in parallel; both must be in place before T006/T007 implementation.
- No source implementation tasks are marked parallel because the service, HTTP boundary, and production wiring share execution flow and dependencies.
- Later story phases are sequential because they extend the same chat service and endpoint.

## Parallel Example: User Story 1

```text
Task: T004 — author the ChatService fake-store tests in src/services/chat-service.test.ts
Task: T005 — author the /chat continuation tests in src/http/server.test.ts
```

## Parallel Example: User Story 2

```text
Task: T008 — author the no-ID creation tests in src/http/server.test.ts
```

## Parallel Example: User Story 3

```text
Task: T010 — author the historyMessages boundary tests in src/http/server.test.ts
```

## Implementation Strategy

### MVP First

User Story 1 is the first independently testable slice: it proves durable continuation using a pre-created conversation. For a usable client journey, deliver User Story 2 immediately afterward so clients can obtain IDs through `/chat`.

### Incremental Delivery

1. Complete Phase 2 and verify SQLite schema, constraints, and bounded retrieval with `:memory:`.
2. Deliver User Story 1 and test continuation with a fake store and strategy.
3. Deliver User Story 2 and verify creation plus follow-up continuation.
4. Deliver User Story 3 and verify the reported metric at the 0/1/12/>12 boundaries.
5. Run the quickstart scenarios, typecheck, and full test suite.

---

## Notes

- `[P]` marks only tasks in separate files with no unfinished dependency.
- Story labels map directly to the prioritized user stories in `specs/007-conversation-persistence/spec.md`.
- Every task has a sequential ID, a checkbox, and an explicit file path.
