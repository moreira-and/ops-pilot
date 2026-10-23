# Tasks: Semantic Memory

**Input**: Design documents from `/specs/008-semantic-memory/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/chat-http.md](./contracts/chat-http.md), [quickstart.md](./quickstart.md)

**Tests**: Add tests for the new behaviors as required by the project constitution. Tests use `node:test` via `tsx`; database tests use `:memory:`, and a model-backed semantic integration test is opt-in for environments with model assets/network access.

**Organization**: Tasks are grouped by the user stories in the feature specification. `[P]` marks work that can proceed independently in different files after its stated prerequisites.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel because it uses different files and has no dependency on incomplete tasks.
- **[Story]**: User story served by the task; setup and foundational tasks have no story label.
- Every task includes the relevant repository file path.

## Phase 1: Setup

**Purpose**: Add the selected embedding runtime dependency.

- [X] T001 Add `@huggingface/transformers` as a production dependency and update `package-lock.json` using the repository package manager in `package.json` and `package-lock.json`.

## Phase 2: Foundational

**Purpose**: Establish shared embedding, validation, and SQLite persistence primitives required by all user stories.

- [X] T002 [P] Add unit tests for lazy singleton initialization, concurrent first use, retry after initialization failure, 384-dimensional finite normalized output, and model invocation options in `src/memory/embeddings.test.ts`.
- [X] T003 [P] Add SQLite adapter tests for the `memories` schema, required columns `id`, `user_id`, `fact`, `embedding`, `created_at`, user index, 1,536-byte BLOB round-trip, and `:memory:` isolation in `src/store/sqlite-memory-store.test.ts`.
- [X] T004 Define Zod schemas and TypeScript types for a memory record, user/fact/query inputs, 384-dimensional finite normalized vectors, and encoder/repository ports in `src/memory/memory-types.ts`.
- [X] T005 Implement the lazy Transformers.js singleton in `src/memory/embeddings.ts` using `onnx-community/all-MiniLM-L6-v2-ONNX`, `pooling: "mean"`, `normalize: true`, explicit `dtype: "fp32"`, a pinned model revision, a shared initialization promise, and retry after rejected initialization.
- [X] T006 Implement the SQLite memory repository in `src/store/sqlite-memory-store.ts` using static idempotent DDL, `DatabaseSync`, prepared statements with bound values, and explicit little-endian Float32 BLOB encoding/decoding; reject vectors unless they contain exactly 384 finite values and blobs are exactly 1,536 bytes.

**Checkpoint**: Shared encoder and SQLite adapter primitives are available; no story may bypass user-scoped persistence or vector validation.

## Phase 3: User Story 1 - Guardar fatos pessoais (Priority: P1)

**Goal**: Persist each fact for its owner and avoid semantically duplicate facts for that same owner.

**Independent Test**: Store a new fact, then a fact whose injected embedding has dot product greater than `0.92`; verify only one record exists for that user and another user cannot retrieve or deduplicate against it.

### Tests for User Story 1

- [X] T007 [P] [US1] Add `node:test` coverage for `remember`: valid record creation with ID/date, rejection of blank user/fact before embedding, strict duplicate threshold `> 0.92`, no duplicate at exactly `0.92`, and per-user isolation in `src/memory/memory-store.test.ts`.
- [X] T008 [P] [US1] Add SQLite repository tests for user-scoped reads/inserts and atomic per-user duplicate-check-and-insert behavior under the store API in `src/store/sqlite-memory-store.test.ts`.

### Implementation for User Story 1

- [X] T009 [US1] Implement `MemoryStore` and `remember(userId, fact)` in `src/memory/memory-store.ts`; trim and validate non-empty `userId`/`fact`, embed before persistence, compare only the same user's records, treat dot product strictly greater than `0.92` as duplicate, retain the existing highest-scoring duplicate, and atomically insert only when no duplicate exists.
- [X] T010 [US1] Implement repository operations for loading one user's records and atomically inserting a nonduplicate record in `src/store/sqlite-memory-store.ts`; persist only the columns `id`, `user_id`, `fact`, `embedding`, `created_at`, bind all values, and retain the first existing record when a duplicate is detected.

**Checkpoint**: Story 1 is independently testable with deterministic embeddings and an in-memory SQLite database.

## Phase 4: User Story 2 - Usar lembranças no chat (Priority: P1)

**Goal**: Recall the most relevant memories for a user and include them in chat context, including semantic matches without shared words.

**Independent Test**: Seed user-scoped memories with deterministic vectors, send a chat request with that `userId`, and verify the strategy receives no more than the top three facts whose dot product is strictly greater than `0.3`; separately run the opt-in model test with paraphrased fact/query text sharing no words.

### Tests for User Story 2

- [X] T011 [P] [US2] Add recall tests for user isolation, descending dot-product ranking, top-three limiting, strict `score > 0.3` inclusion (excluding exactly `0.3`), and empty results below the cutoff in `src/memory/memory-store.test.ts`.
- [X] T012 [P] [US2] Add an opt-in model-backed integration test that remembers a fact and recalls it from a paraphrased query with no shared content words, using the real encoder and the `OPSPILOT_RUN_MODEL_TESTS=1` opt-in switch in `src/memory/semantic-recall.integration.test.ts`.
- [X] T013 [P] [US2] Add HTTP/service tests requiring non-empty `userId`, asserting invalid identity does not access memory, recalled facts are included in the strategy input, empty recall still allows chat, and embedding/store failures return an error without a successful answer in `src/http/server.test.ts` and `src/services/chat-service.test.ts`.

### Implementation for User Story 2

- [X] T014 [US2] Implement `recall(userId, query, k = 3)` in `src/memory/memory-store.ts`; embed the query, load only that user's records, score with dot product, sort descending, apply `.slice(0, k)`, then retain only memories with `score > 0.3`, matching the supplied recall reference.
- [X] T015 [US2] Add a per-user candidate query and deterministic score-tie ordering support to `src/store/sqlite-memory-store.ts`, validating every decoded 384-element vector before returning it.
- [X] T016 [US2] Require trimmed non-empty `userId` in the `/chat` request schema, inject the configured memory store into chat orchestration, recall before strategy execution, compose recalled facts with existing conversation context, and translate memory failures without returning success in `src/http/server.ts` and `src/services/chat-service.ts`.
- [X] T017 [US2] Align the spec and design docs to the clarified strict recall boundary `score > 0.3` and update the acceptance scenarios, FR-005, edge cases, success criteria, data-model rules, research decision, HTTP contract, and quickstart in `specs/008-semantic-memory/spec.md`, `specs/008-semantic-memory/data-model.md`, `specs/008-semantic-memory/research.md`, `specs/008-semantic-memory/contracts/chat-http.md`, and `specs/008-semantic-memory/quickstart.md`.

**Checkpoint**: Story 2 is independently testable with injected vectors; the opt-in integration test demonstrates retrieval from meaning rather than word overlap.

## Phase 5: User Story 3 - Esquecer um fato (Priority: P2)

**Goal**: Remove an identified memory only for its owning user.

**Independent Test**: Remember a fact, forget it by ID as its owner, and verify subsequent recall excludes it; attempt to forget the same ID as another user and verify it remains.

### Tests for User Story 3

- [X] T018 [P] [US3] Add tests that forgetting an owned memory removes it, forgetting an unknown ID reports no deletion, and forgetting another user's ID leaves that record unchanged and undisclosed in `src/memory/memory-store.test.ts`.
- [X] T019 [P] [US3] Add SQLite tests verifying deletion binds both `user_id` and memory `id`, and returns an unambiguous deleted/not-deleted result in `src/store/sqlite-memory-store.test.ts`.

### Implementation for User Story 3

- [X] T020 [US3] Implement `forget(userId, memoryId)` in `src/memory/memory-store.ts`, validating both identifiers and returning whether an owned record was removed without revealing whether a foreign user's ID exists.
- [X] T021 [US3] Implement prepared, bound, user-scoped deletion in `src/store/sqlite-memory-store.ts` using both `user_id` and `id`, and return the affected-row result.

**Checkpoint**: Story 3 is independently testable and cannot remove or reveal another user's memory.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate complete integration and document execution expectations.

- [X] T022 Update `specs/008-semantic-memory/quickstart.md` with the actual test selectors, opt-in model integration command, expected semantic-recall result, and HTTP validation flow.
- [X] T023 Run focused memory, embedding, SQLite, chat, and HTTP tests, then run `npm run typecheck` and `npm test`; fix failures in the affected `src/memory/`, `src/store/`, `src/services/`, and `src/http/` files.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No prerequisites.
- **Foundational (Phase 2)**: Depends on T001; required before all user stories.
- **US1 (Phase 3)**: Depends on T002-T006.
- **US2 (Phase 4)**: Depends on T002-T006 and the `MemoryStore`/repository interfaces from US1 (T009-T010).
- **US3 (Phase 5)**: Depends on T002-T006 and the `MemoryStore`/repository interfaces from US1 (T009-T010); can proceed independently of US2 after US1.
- **Polish (Phase 6)**: Depends on all user stories.

### User Story Completion Order

```text
Setup -> Foundational -> US1 -> US2 -> Polish
                              \-> US3 -/
```

US1 is the first MVP increment. US2 and US3 share the memory implementation files and should be implemented sequentially unless changes are isolated to different files.

### Parallel Opportunities

- T002 and T003 can be authored in parallel because they target different test files.
- T005 and T006 can be implemented in parallel after T004; they target the embedding and repository adapter files separately.
- T007 and T008 can be authored in parallel after the foundational phase.
- In US2, T011, T012, and T013 can be authored in parallel before the implementation tasks.
- In US3, T018 and T019 can be authored in parallel.

## Implementation Strategy

1. Complete Setup and Foundational work to establish dependency, validated vector types, encoder, and SQLite adapter.
2. Deliver **MVP: US1** first with per-user persistence and atomic deduplication.
3. Deliver US2 to add semantic recall and chat prompt injection; test exact boundaries from the supplied reference (`> 0.3`) and run the real-model integration test when enabled.
4. Deliver US3 to allow safe, user-scoped forgetting.
5. Run the focused feature tests, typecheck, full test suite, and quickstart scenarios.

## Checklist Format Validation

All task entries use `- [ ] Tnnn`, include `[P]` only for parallelizable tasks, include `[USn]` for user-story tasks only, and provide specific repository file paths.
