---

description: "Task list for Context Token Metrics"
---

# Tasks: Context Token Metrics

**Input**: Design documents from `/specs/012-context-token-metrics/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/chat-metrics.md](./contracts/chat-metrics.md), [quickstart.md](./quickstart.md)

**Tests**: Included because FR-008 requires automated tests (`node:test` via `tsx`).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Foundational (blocking)

**Purpose**: Pure estimator and schema fields used by all stories.

- [X] T001 [P] Create `src/context/tokens.ts` exporting `estimateTokens(text: string): number` = `Math.ceil(text.length / 4)`, 0 for empty text, and `estimateBreakdown(sources)` returning `{ system, summary, history, memories, message }` as non-negative integers (absent source = 0).
- [X] T002 [P] Create `src/context/tokens.test.ts` covering: empty text is 0, 1–4 chars is 1, 5 chars is 2, non-ASCII text, determinism, and breakdown with absent sources.
- [X] T003 Add optional `promptTokens: z.number().int().nonnegative().optional()` to `reasoningMetricsSchema` in `src/agents/reasoning.ts` (backward compatible with arena/bench).

## Phase 2: User Story 1 - Real promptTokens (Priority: P1)

**Goal**: `/chat` metrics report provider-reported prompt tokens summed over the turn; absent when not reported.

**Independent Test**: Fake LLM end result with usage yields exact sum; without usage yields `undefined`.

- [X] T004 [P] [US1] Extend `ModelCallCounter` in `src/agents/metrics.ts` with `handleLLMEnd(output, runId)` reading `output.llmOutput.tokenUsage.promptTokens`, falling back to `generations[0][0].message.usage_metadata.input_tokens`; store per runId (no double counting) and expose `get promptTokens(): number | undefined` (undefined if no call reported usage; malformed values ignored).
- [X] T005 [P] [US1] Add tests in `src/agents/metrics.test.ts`: usage present (single and multiple runs summed), both usage shapes, same runId counted once, absent/malformed usage gives `undefined`.
- [X] T006 [US1] Include `promptTokens: counter.promptTokens` in returned metrics in `src/agents/react.ts` and sum candidate + critic counter values (undefined-aware) in `src/agents/reflection.ts`; omit the key when undefined.
- [X] T007 [US1] Extend `src/agents/react.test.ts` and `src/agents/reflection.test.ts` with a fake model reporting usage, asserting `metrics.promptTokens`, and one without usage asserting it is absent.
- [X] T008 [US1] Allow optional `promptTokens` in the `/chat` response metrics schema in `src/http/server.ts` (inherited from `reasoningMetricsSchema.extend`) and pass strategy metrics through in `src/services/chat-service.ts`; add an HTTP test in `src/http/server.test.ts` with a fake strategy returning `promptTokens` and one without.

## Phase 3: User Story 2 - contextBreakdown (Priority: P1)

**Goal**: `/chat` metrics include estimated tokens per context source.

**Independent Test**: Known texts per source produce ceil(chars/4) values for all five keys.

- [X] T009 [US2] In `src/services/chat-service.ts`, compute `contextBreakdown` via `estimateBreakdown` from the summary, history, memories sections and message as placed in the built prompt (post-budget); `system` is 0 (strategy-owned). Add it to the returned metrics next to `historyMessages`.
- [X] T010 [US2] Add required `contextBreakdown: z.object({ system, summary, history, memories, message })` (each `z.number().int().nonnegative()`) to the `/chat` response metrics schema in `src/http/server.ts` and the metrics schema in `src/services/chat-service.ts`.
- [X] T011 [US2] Add tests in `src/services/chat-service.test.ts` and `src/http/server.test.ts`: all five keys present, values equal ceil(chars/4) of known inputs, empty summary/memories give 0, and prompt/reply behavior unchanged (FR-007).

## Phase 4: User Story 3 - conversa-longa.sh (Priority: P2)

**Goal**: Script prints `promptTokens` per turn.

**Independent Test**: Run against a stub or running service; one line per turn.

- [X] T012 [US3] Create executable `conversa-longa.sh` at repo root (`chmod +x`): env `BASE_URL` (default `http://localhost:3000`), `TURNS` (default 10); POST each turn to `/chat` with a fixed `userId` and the returned `conversationId`; parse JSON with `node -e` (no jq); print `turno <n> promptTokens=<int|n/a>`; on HTTP failure print `turno <n> erro=<status>` and continue.
- [X] T013 [US3] Add `src/scripts/conversa-longa.test.ts` that starts a stub HTTP server (one response with `promptTokens`, one without, one 500), runs the script with `BASE_URL`/`TURNS=3` via `child_process`, and asserts the three output lines.

## Phase 5: Polish

- [X] T014 Run `npm run typecheck` and `npm test`; fix regressions.
- [X] T015 Walk through [quickstart.md](./quickstart.md) and confirm the contract in [contracts/chat-metrics.md](./contracts/chat-metrics.md) matches actual output.

## Dependencies

- T001, T002, T003 first (T002 after T001). US1 needs T003; US2 needs T001, T003; US3 needs US1/US2 output shape (T008, T010).
- T006 depends on T004; T008 on T006; T010 on T009.

## Parallel Examples

- T001 ∥ T003; T004 ∥ T005; T012 can start once the contract is fixed.

## Implementation Strategy

MVP = Foundational + US1 (real `promptTokens`), then US2, then US3, each verified by `npm run typecheck && npm test`.
