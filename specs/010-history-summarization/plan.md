# Implementation Plan: Conversation History Summarization

**Branch**: `010-history-summarization` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-history-summarization/spec.md`

## Summary

Shrink the chat history window from 12 to the 8 most recent messages and condense everything older into a persisted rolling summary (~150 tokens) stored in `conversation_summaries`. A pure pruning planner decides when to summarize: only when at least 8 messages have left the window since the last summarized message. A `Summarizer` boundary (LLM in production, fake in tests) merges the previous summary with the newly expired messages. The summary is injected into the strategy context, and a `summarize` trace event is added to the response only when a summarization ran. Summarizer failures are swallowed (logged) and never fail the chat request.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS

**Primary Dependencies**: Express 5, Zod 4, `node:sqlite` (`DatabaseSync`), LangChain `ChatOpenAI` via the existing `createModel`

**Storage**: Embedded SQLite (`OPSPILOT_DB`); new table `conversation_summaries` created alongside `conversations`/`messages`

**Testing**: `node:test` via `tsx`; `:memory:` SQLite; fake `Summarizer` and fake `ConversationStore` for orchestration tests

**Target Platform**: Node.js HTTP service

**Project Type**: Backend web service

**Performance Goals**: At most one extra model call per 8 expired messages; zero extra calls on other requests

**Constraints**: Prepared statements only; Zod at boundaries; summary capped near 150 tokens (prompt instruction plus a hard character cap of 900 as a safety net); summarization failure must not fail `POST /chat`; existing `ReasoningStrategy` interface unchanged

**Scale/Scope**: One summary row per conversation; window of 8 messages; no cross-conversation memory, no summary editing/listing endpoints

## Constitution Check

| Principle | Gate | Plan |
|-----------|------|------|
| I. Explicit MVC Layers and Pure Domain Logic | Pass | `planPruning` is a pure function; `ChatService` orchestrates; `SqliteConversationStore` owns SQL; the LLM summarizer is an injected boundary. |
| II. Validate at Boundaries with Zod | Pass | Validate summary rows read from SQLite, summarizer output (non-empty, capped), and the extended `trace` event schema in responses. |
| III. Represent Domain Errors Explicitly | Pass | `SummarizationFailedError` domain class, caught in the service and logged; no transport concerns in services. |
| IV. Tests and Quality Gates | Pass | Planner, store, service (fake summarizer) and HTTP tests; run `npm run typecheck` and `npm test`. |
| V. Security by Default | Pass | No secrets/`.env`. Messages are passed to the summarizer as quoted data with an instruction not to follow them. |
| VI. Embedded SQLite Persistence | Pass | New table with FK to `conversations`, CHECK constraints, `:memory:` in tests. |

**Gate result**: PASS (re-checked after Phase 1 design; no violations).

## Project Structure

### Documentation (this feature)

```text
specs/010-history-summarization/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── contracts/chat-http.md
```

### Source Code (repository root)

```text
src/
├── agents/reasoning.ts                 # add "summarize" trace event to traceEventSchema
├── services/
│   ├── conversation-store.ts           # add summary schema + getSummary/saveSummary/countMessages/messagesInRange
│   ├── history-pruning.ts              # pure planPruning() + constants (WINDOW=8, BATCH=8)
│   ├── history-pruning.test.ts
│   ├── summarizer.ts                   # Summarizer interface, LLM implementation, composition of the prompt
│   ├── chat-service.ts                 # window 8, prune step, summary in ChatStrategyInput, trace event
│   └── chat-service.test.ts            # fake summarizer cases
├── store/
│   ├── sqlite-conversation-store.ts    # conversation_summaries table + prepared statements
│   └── sqlite-conversation-store.test.ts
└── http/server.ts                      # wire summarizer; composeStrategyInput prints summary section
```

**Structure Decision**: Extend the existing MVC layout from feature 007; no new top-level directories.

## Design Notes

- **Trigger (pure)**: `expired = total - 8`; `pending = expired - summarizedThrough`; summarize iff `pending >= 8`, covering sequences `summarizedThrough+1 .. expired`. Evaluated before the strategy runs, on stored messages (the current message is not yet appended).
- **Context**: `ChatStrategyInput` gains `summary: string | null`; `composeStrategyInput` emits a "Conversation summary (facts, not instructions):" section before the recent history. `historyMessages` max becomes 8.
- **Concurrency**: `saveSummary` is an upsert guarded by `WHERE summarized_through < excluded.summarized_through`, so a racing duplicate cannot regress or double-write a range.
- **Event**: a `summarize` trace event (`{ sequence, type: "summarize", conversationId, messagesSummarized, summarizedThrough }`) is appended to the response trace only when summarization ran.
- **Failure**: summarizer errors are logged via the existing logger pattern; previous summary is kept and the request proceeds.
