# Implementation Plan: Persistent Conversations

**Branch**: `007-conversation-persistence` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-conversation-persistence/spec.md`

## Summary

Add durable conversation history to `POST /chat`. A conversation store creates conversations, appends user and assistant messages, and retrieves a bounded chronological history. The chat service invokes a strategy boundary with `{ message, history }`; the HTTP adapter composes that history with the current user message for the existing string-based reasoning strategies. Successful responses include the active `conversationId` and the `historyMessages` count; unrecognized conversation IDs and persistence errors remain explicit failures.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS

**Primary Dependencies**: Express 5, Zod 4, Node.js `node:sqlite` (`DatabaseSync`), existing reasoning strategies

**Storage**: Embedded SQLite using the existing `OPSPILOT_DB` path and a dedicated conversation/messages schema

**Testing**: `node:test` via `tsx`; SQLite adapter tests use `:memory:`, and chat orchestration/HTTP tests inject fake stores and strategies

**Target Platform**: Node.js HTTP service

**Project Type**: Backend web service

**Performance Goals**: Retrieve no more than 12 preceding messages per chat request; preserve the existing 180-second strategy execution timeout

**Constraints**: Validate HTTP input and output with Zod; use prepared statements and bound values for every query; preserve the current `ReasoningStrategy` interface by composing history into its string input; return no successful result when conversation persistence fails

**Scale/Scope**: One conversation per chat thread, one persistent message stream per conversation, and at most 12 prior messages included in each strategy input; no conversation listing, deletion, authentication, or cross-conversation sharing

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan |
|-----------|------|------|
| I. Explicit MVC Layers and Pure Domain Logic | Pass | The HTTP controller validates and translates requests; `ChatService` orchestrates context and persistence; the store interface and SQLite adapter own database access. Prompt composition remains a pure function. |
| II. Validate at Boundaries with Zod | Pass | Validate the optional request identifier and the complete success response, including conversation ID and history count. Validate mapped persisted records at the persistence boundary. |
| III. Represent Domain Errors Explicitly | Pass | Reuse an explicit not-found domain error for unknown conversations; translate it to HTTP 404. Surface storage failures through the existing generic 500 boundary without returning success-shaped data. |
| IV. Tests and Quality Gates | Pass | Add deterministic store, service, and HTTP tests with `node:test`; validate the SQLite adapter with `:memory:` and use fake stores/strategies for isolated orchestration tests. Run `npm run typecheck` and `npm test`. |
| V. Security by Default | Pass | No secrets or `.env` contents are needed. Use fixed SQL with prepared statements and bound values; constrain message roles and parent conversation references in the schema. |
| VI. Embedded SQLite Persistence | Pass | Persist conversations and messages with `node:sqlite`; enforce referential and closed-role constraints, and support in-memory tests. |

**Gate result**: PASS. No constitution violations or unresolved design clarifications.

## Project Structure

### Documentation (this feature)

```text
specs/007-conversation-persistence/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── chat-http.md
```

### Source Code (repository root)

```text
src/
├── http/
│   ├── server.ts
│   └── server.test.ts
├── services/
│   ├── chat-service.ts
│   ├── conversation-store.ts
│   └── chat-service.test.ts
├── store/
│   ├── sqlite-conversation-store.ts
│   └── sqlite-conversation-store.test.ts
├── agents/
│   └── reasoning.ts
└── index.ts
```

**Structure Decision**: Extend the existing backend web service. Keep the store port and chat orchestration in `src/services/`, the SQLite adapter in `src/store/`, and HTTP validation/translation in `src/http/`. Wire the production adapter into the existing server entrypoint. Keep tests beside the implementation, consistent with the project’s `src/**/*.test.ts` runner.

## Complexity Tracking

No constitution violations; no additional complexity justification is required.

## Phase 0: Research

See [research.md](./research.md). The project’s SQLite conventions and strategy interface resolve all technical choices; no clarification is required.

## Phase 1: Design & Contracts

- [Data model](./data-model.md): conversation and ordered message entities, constraints, and store operations.
- [HTTP contract](./contracts/chat-http.md): request, success response, error translation, and execution/persistence order.
- [Quickstart](./quickstart.md): in-memory store tests, fake-driven chat tests, and quality-gate commands.

**Post-design Constitution Check**: PASS. The design maintains the MVC boundary, validates HTTP and persisted data with Zod, represents missing conversations as domain errors, and uses bounded prepared SQLite queries with deterministic tests.
