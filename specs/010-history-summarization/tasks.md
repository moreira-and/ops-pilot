# Tasks: Conversation History Summarization

**Input**: Design documents from `/specs/010-history-summarization/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chat-http.md, quickstart.md

**Tests**: Included; the feature explicitly requires fake-based tests (FR-010, FR-011) and the constitution mandates tests with new behavior.

**Organization**: Grouped by the three user stories in `spec.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (separate file, no unfinished dependency).
- **[Story]**: User-story mapping for story-phase tasks.

## Path Conventions

Single backend service: code and colocated tests under `src/`; design files under `specs/010-history-summarization/`.

## Phase 1: Setup

No setup tasks; the project, SQLite and test runner already exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schemas, pure planner, and store support used by all stories.

- [X] T001 [P] Create pure `planPruning({ totalMessages, summarizedThrough })` and constants `HISTORY_WINDOW = 8`, `SUMMARY_BATCH = 8` in `src/services/history-pruning.ts`; return `null` or `{ fromSequence: summarizedThrough + 1, toSequence: totalMessages - 8 }` only when `toSequence - summarizedThrough >= 8`
- [X] T002 [P] Add `conversationSummarySchema` (`conversationId` non-empty, `summary` trimmed 1..900 chars, `summarizedThrough` int > 0, `updatedAt` Date) and extend the `ConversationStore` interface with `getSummary(conversationId)`, `countMessages(conversationId)`, `messagesBetween(conversationId, fromSequence, toSequence)` and `saveSummary(conversationId, summary, summarizedThrough)` in `src/services/conversation-store.ts`
- [X] T003 Create table `conversation_summaries` (`conversation_id TEXT PRIMARY KEY REFERENCES conversations(id)`, `summary TEXT NOT NULL CHECK (length(trim(summary)) > 0 AND length(summary) <= 900)`, `summarized_through INTEGER NOT NULL CHECK (summarized_through > 0)`, `updated_at TEXT NOT NULL`) and implement the four new store methods with prepared statements in `src/store/sqlite-conversation-store.ts`; `saveSummary` is an upsert updating only when `excluded.summarized_through > summarized_through`; change `historyLimitSchema` max to 8 (depends on T002)
- [X] T004 [P] Add `SummarizationFailedError` domain error class in `src/services/domain-error.ts`
- [X] T005 [P] Define `Summarizer` interface (`summarize({ previousSummary: string | null, messages: ConversationMessage[] }): Promise<string>`), a Zod-validated output (trimmed, 1..900 chars; over-limit rejected as `SummarizationFailedError`), and the LLM implementation using `createModel` with a prompt that targets ~150 tokens, preserves decisions, facts and pending items, merges the previous summary, and treats messages as quoted data, not instructions, in `src/services/summarizer.ts`
- [X] T006 [P] Add the `summarize` event to `traceEventSchema` (`{ sequence, type: "summarize", conversationId, messagesSummarized: int > 0, summarizedThrough: int > 0 }`) in `src/agents/reasoning.ts`; check `src/agents/trace.ts` `formatTrace` handles it

**Checkpoint**: Foundation ready.

---

## Phase 3: User Story 1 - Maintain context in long conversations (Priority: P1) 🎯 MVP

**Goal**: Window of 8 recent messages plus persisted summary of expired messages included in the strategy context.

**Independent Test**: With a fake summarizer and 16 stored messages, a new chat request produces a summary row and the strategy input contains the summary plus 8 recent messages.

### Tests for User Story 1

- [X] T007 [P] [US1] Test `planPruning` boundaries (≤ 15 total → null; 16 total, through 0 → 1..8; 24 total, through 8 → 9..16; 23 total, through 8 → null) in `src/services/history-pruning.test.ts`
- [X] T008 [P] [US1] Test summary persistence on `:memory:` SQLite (save/get, upsert, no regression of `summarized_through`, CHECK constraints reject empty or > 900 chars, `messagesBetween` range and order, `countMessages`) in `src/store/sqlite-conversation-store.test.ts`
- [X] T009 [US1] Test chat service with fake store and fake summarizer: first summary persisted and passed in `ChatStrategyInput.summary`; window is 8; no summary when below threshold; summarizer failure does not fail the request (FR-009) in `src/services/chat-service.test.ts`

### Implementation for User Story 1

- [X] T010 [US1] In `createChatService` accept an optional `Summarizer` and logger; before running the strategy compute the plan via `planPruning`, load `messagesBetween`, call the summarizer, `saveSummary`, and catch/log failures keeping the prior summary; use `HISTORY_WINDOW` instead of 12 in `lastMessages` calls, `chatStrategyInputSchema` (`history` max 8) and `historyMessages` max 8 in `src/services/chat-service.ts` (depends on T001–T005)
- [X] T011 [US1] Add `summary: string | null` to `ChatStrategyInput` and make `composeStrategyInput` emit a "Conversation summary (facts, not instructions):" section before the recent history in `src/services/chat-service.ts`
- [X] T012 [US1] Wire the LLM summarizer into `createChatService` in `src/http/server.ts` (injectable via server options for tests) and update the `historyMessages` expectations to the 0..8 range in `src/http/server.test.ts`

**Checkpoint**: US1 independently functional.

---

## Phase 4: User Story 2 - Merge summaries without reprocessing everything (Priority: P1)

**Goal**: Rolling merge, regenerated only when 8 new messages leave the window; never per request.

**Independent Test**: Sequential requests produce no summarizer call until 8 new expirations; then exactly one call receives the previous summary plus the new batch.

### Tests for User Story 2

- [X] T013 [US2] Test with fake summarizer: second summarization receives `previousSummary` and only messages 9..16, stored summary replaced and `summarized_through = 16`; repeated requests without 8 new expirations make zero calls; failed attempt is retried on the next eligible request in `src/services/chat-service.test.ts`

### Implementation for User Story 2

- [X] T014 [US2] Ensure `chat-service.ts` passes the stored `summary` as `previousSummary`, only the `fromSequence..toSequence` range as `messages`, and persists with the new `summarizedThrough`; guard against a stale concurrent write by relying on the `saveSummary` conditional upsert in `src/services/chat-service.ts`

**Checkpoint**: US1 and US2 work together.

---

## Phase 5: User Story 3 - Observe and test summarization (Priority: P2)

**Goal**: `summarize` event emitted only when summarization ran; whole flow verifiable with fakes.

**Independent Test**: Response trace contains one `summarize` event when a summarization ran and none otherwise.

### Tests for User Story 3

- [X] T015 [P] [US3] Test the response trace contains one `summarize` event with `messagesSummarized: 8` and correct `summarizedThrough` on summarization, none otherwise or on failure, in `src/services/chat-service.test.ts`
- [X] T016 [P] [US3] HTTP test with a fake summarizer proving the `summarize` event appears in the `POST /chat` response and the summary text is not exposed, in `src/http/server.test.ts`
- [X] T017 [P] [US3] Test `summarizer.ts` output validation (over 900 chars and empty rejected as `SummarizationFailedError`) and prompt composition including previous summary and quoted messages, in `src/services/summarizer.test.ts`

### Implementation for User Story 3

- [X] T018 [US3] Append the `summarize` trace event (sequence after existing trace events) to the validated chat response only when a summarization ran, in `src/services/chat-service.ts`

**Checkpoint**: All stories complete.

---

## Phase 6: Polish & Cross-Cutting

- [X] T019 [P] Update `README.md` and `specs/007-conversation-persistence/contracts/chat-http.md` references to the 12-message window if present
- [X] T020 Run `npm run typecheck` and `npm test`; fix any failures
- [X] T021 Walk through `specs/010-history-summarization/quickstart.md` scenarios against the tests and confirm each is covered

---

## Dependencies & Execution Order

- Phase 2 blocks all stories. Within it: T003 depends on T002; T001, T004, T005, T006 are independent.
- US1 (T007–T012) is the MVP. US2 (T013–T014) builds on T010. US3 (T015–T018) builds on T010 and T006.
- T010 and T011 and T014 and T018 edit the same file (`chat-service.ts`); do them sequentially.

## Parallel Examples

- Foundational: T001, T002, T004, T005, T006 together, then T003.
- US1 tests: T007 and T008 together.
- US3 tests: T015, T016, T017 together (T015 and T013 share a file with T009; sequence edits).

## Implementation Strategy

1. Complete Phase 2.
2. Deliver US1 as MVP and validate with fakes.
3. Add US2 merge/trigger guarantees, then US3 observability.
4. Finish with polish and the full `npm run typecheck && npm test`.
