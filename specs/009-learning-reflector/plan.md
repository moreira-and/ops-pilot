# Implementation Plan: Learning Reflector

**Branch**: `009-learning-reflector` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-learning-reflector/spec.md`

## Summary

After each successful chat answer, asynchronously evaluate only the latest user message with structured output and store a concise, durable, non-secret fact through the existing user-scoped `MemoryStore`. Add a `forget_preference` agent tool that receives trusted per-invocation user context, finds a uniquely identified preference, and deletes only the requesting user's memory; ambiguous matches return clarification information without deleting anything.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS

**Primary Dependencies**: Existing `@langchain/openai` `ChatOpenAI.withStructuredOutput`, LangChain/LangGraph agent tools and runtime context, Zod 4, existing semantic `MemoryStore`

**Storage**: Existing SQLite `memories` table through `MemoryStore` and `SqliteMemoryStore`; this feature adds no persistent tables or columns

**Testing**: `node:test` via `tsx`; inject structured-output extraction and memory operations for deterministic unit/service/HTTP tests; use SQLite `:memory:` for tool deletion/isolation tests; no network access required for standard tests

**Target Platform**: Node.js HTTP service and its LangGraph-backed chat agents

**Project Type**: Backend web service

**Performance Goals**: Chat response delivery does not wait for the learning model or memory write; a forget tool call performs one bounded semantic lookup (existing top-3 recall) and removes at most one record

**Constraints**: Learning starts only after a successful response and evaluates only that request's latest user message; a background failure is logged and cannot change the completed response; invalid structured output or detected secret-like content fails closed; the model never supplies the deletion owner; ambiguous/low-confidence deletion candidates do not cause a delete; existing memory deduplication remains authoritative

**Scale/Scope**: One asynchronous learning attempt per successful chat response; one fact candidate per message; one `forget_preference` tool; no durable job queue, API for manual memory management, history-wide extraction, new table, or cross-user memory lookup

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan |
|-----------|------|------|
| I. Explicit MVC Layers and Pure Domain Logic | Pass | Chat service schedules learning; an injected learning service owns extraction orchestration; existing MemoryStore owns memory operations; tool adapts agent input to that service. |
| II. Validate at Boundaries with Zod | Pass | Parse structured extractor output, memory candidates, tool input, trusted runtime context, and tool result with Zod. |
| III. Represent Domain Errors Explicitly | Pass | Extractor and memory failures remain errors and are logged by the background boundary; forget failures are tool errors, while not-found and ambiguous matches are explicit domain outcomes. |
| IV. Tests and Quality Gates | Pass | Add deterministic tests for extraction, async behavior, failures, secret rejection, and forget-tool scope/ambiguity; run typecheck and full test suite. |
| V. Security by Default | Pass | Never accept owner identity from model-controlled tool arguments; operate on runtime-provided user context; omit secret-like candidates and never include secret values in logs. |
| VI. Embedded SQLite Persistence | Pass | Reuse the current prepared-statement SQLite memory adapter; no new persistence mechanism or direct SQL is introduced. |

**Gate result**: PASS. Design decisions and dependency patterns are recorded in [research.md](./research.md); no clarification is required.

## Project Structure

### Documentation (this feature)

```text
specs/009-learning-reflector/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── learning-and-forget-tools.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── react.ts
│   ├── plan-and-execute.ts
│   ├── reflection.ts
│   ├── index.ts
│   ├── tools.ts
│   └── tools.test.ts
├── http/
│   ├── server.ts
│   └── server.test.ts
└── services/
    ├── chat-service.ts
    ├── chat-service.test.ts
    ├── learning-service.ts
    ├── learning-service.test.ts
    ├── memory-safety.ts
    ├── memory-safety.test.ts
    ├── preference-forget-service.ts
    └── preference-forget-service.test.ts
```

**Structure Decision**: Extend the existing backend and MVC seams. Keep learning orchestration and secret checks in services, call the existing `MemoryStore.remember`, add `forget_preference` in the existing agent-tools module, and pass trusted request identity through LangGraph runtime context or strategy options rather than prompt text or model-generated arguments. Register the tool in both supported chat strategies and extend the relevant HTTP/service/agent tests.

## Complexity Tracking

No constitution violations; no additional complexity justification is required.

## Phase 0: Research

See [research.md](./research.md). Structured-output support, trusted agent runtime context, asynchronous failure handling, and conservative semantic deletion behavior are resolved.

## Phase 1: Design & Contracts

- [Data model](./data-model.md): ephemeral learning candidate, existing persisted memory, and forget outcomes.
- [Learning and forget tool contracts](./contracts/learning-and-forget-tools.md): structured extractor result, `forget_preference` inputs, trusted identity source, and outcomes.
- [Quickstart](./quickstart.md): deterministic test and end-to-end validation commands.

**Post-design Constitution Check**: PASS. The design maintains MVC boundaries, validates both model and tool data, does not trust the LLM with user identity, reuses SQLite persistence, avoids storing secret-like content, and tests asynchronous execution without requiring a live model.
