# Implementation Plan: Semantic Memory

**Branch**: `008-semantic-memory` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-semantic-memory/spec.md`

## Summary

Add semantic memory to the existing chat flow. A user-scoped `MemoryStore` will embed, deduplicate, persist, recall, and forget facts. `/chat` will require `userId`, retrieve at most three memories by dot product, and add eligible facts to the strategy context. Use the requested Transformers.js all-MiniLM-L6-v2 encoder with mean pooling and normalization, initialized lazily, and a prepared-statement SQLite adapter storing embeddings as BLOBs.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS

**Primary Dependencies**: Express 5, Zod 4, Node.js 22.13+ `node:sqlite` (`DatabaseSync`), `@huggingface/transformers`, existing reasoning strategies

**Storage**: Existing embedded SQLite database configured by `OPSPILOT_DB`; new `memories` table with `id`, `user_id`, `fact`, 384-dimensional little-endian Float32 `embedding` BLOB, and `created_at`

**Testing**: `node:test` via `tsx`; SQLite tests use `:memory:`, service/HTTP tests inject deterministic embedding providers, and a model-backed semantic integration test exercises paraphrased, non-overlapping vocabulary

**Target Platform**: Node.js HTTP service

**Project Type**: Backend web service

**Performance Goals**: Recall returns no more than three facts and compares only the requesting user's stored facts; encoding is initialized once per process and loaded on first use; each persisted vector occupies 1,536 bytes

**Constraints**: `userId` must be validated at the HTTP boundary; all SQLite queries use prepared statements and bound values; embeddings use mean pooling and L2 normalization so dot product represents cosine similarity; one fact/query is bounded by the encoder's 256-word-piece model limit; a memory failure fails the chat explicitly rather than silently omitting context; no external vector database

**Scale/Scope**: Per-user exhaustive similarity scan for the current memory set; top-3 retrieval; no memory-management HTTP endpoints, authentication redesign, cross-user sharing, or vector-index service

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan |
|-----------|------|------|
| I. Explicit MVC Layers and Pure Domain Logic | Pass | HTTP validates `userId`; chat orchestration retrieves memory and composes context; memory service/store owns domain behavior and persistence; encoder is an injected boundary dependency. |
| II. Validate at Boundaries with Zod | Pass | Validate chat input and response at HTTP boundaries; validate memory inputs, encoder vector dimensions/finiteness, and mapped stored records. |
| III. Represent Domain Errors Explicitly | Pass | Model invalid memory input and storage/embedding failures explicitly; translate failures at the HTTP edge without success-shaped fallback. |
| IV. Tests and Quality Gates | Pass | Add unit, SQLite, service, HTTP, and semantic integration coverage with `node:test`; run `npm run typecheck` and `npm test`. |
| V. Security by Default | Pass | Scope every lookup, deduplication, and deletion by bound `user_id`; do not read `.env` or add credentials. The caller remains responsible for the trustworthiness of the supplied user identity, consistent with the spec assumption. |
| VI. Embedded SQLite Persistence | Pass | Store facts and embedding BLOBs in SQLite using `DatabaseSync`, prepared statements, bound values, and `:memory:` tests. |

**Gate result**: PASS. Implementation choices are resolved in [research.md](./research.md); no clarification is required.

## Project Structure

### Documentation (this feature)

```text
specs/008-semantic-memory/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
```text
src/
├── http/
│   ├── server.ts
│   └── server.test.ts
├── memory/
│   ├── embeddings.ts
│   ├── embeddings.test.ts
│   ├── memory-store.ts
│   └── memory-store.test.ts
├── services/
│   ├── chat-service.ts
│   └── chat-service.test.ts
└── store/
    ├── sqlite-memory-store.ts
    └── sqlite-memory-store.test.ts
```

**Structure Decision**: Extend the existing backend. Put the user-facing memory operations in the requested `src/memory/memory-store.ts`, the lazy model singleton in `src/memory/embeddings.ts`, and SQLite persistence in `src/store/sqlite-memory-store.ts`. The chat service consumes the memory operations; HTTP input/response validation and error mapping stay in `src/http/`. The repository currently has no `src/memory/` directory; create it for the feature. Do not use the legacy Sequelize migration layer for this SQLite feature; follow existing SQLite adapters' idempotent static DDL setup.

## Complexity Tracking

No constitution violations; no additional complexity justification is required.

## Phase 0: Research

See [research.md](./research.md). The requested embedding model, vector representation, SQLite persistence, and integration seams are resolved.

## Phase 1: Design & Contracts

- [Data model](./data-model.md): per-user memory fields, BLOB representation, validation, and lifecycle.
- [HTTP contract](./contracts/chat-http.md): required `userId`, memory recall behavior, and error handling for `/chat`.
- [Quickstart](./quickstart.md): database, service, semantic recall, and HTTP validation scenarios.

**Post-design Constitution Check**: PASS. The design retains the MVC boundaries, validates user input and stored vectors, uses per-user bound queries and embedded SQLite, and adds deterministic tests for the thresholds and chat integration.
