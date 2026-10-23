# Implementation Plan: Context Budgeting

**Branch**: `011-context-budgeting` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-context-budgeting/spec.md`

## Summary

Introduce a shared, deterministic context builder for chat prompts used by every registered reasoning strategy. It will preserve strategy system instructions and the latest user message, independently constrain summary, recent history, and scored memories, and read validated per-section overrides from `CONTEXT_BUDGET`. Use the tokenizer already present in the dependency tree as a direct dependency, with one canonical encoding for predictable budgets and tests.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS

**Primary Dependencies**: Existing Express 5, Zod 4, LangChain strategies; promote existing transitive `js-tiktoken` dependency to a direct dependency

**Storage**: None; the builder transforms prompt input only and does not change persisted conversation, summary, or memory data

**Testing**: `node:test` via `tsx`; pure context-builder tests plus chat-service and HTTP integration tests with fake strategies, no provider access

**Target Platform**: Node.js HTTP service

**Project Type**: Backend web service

**Performance Goals**: Bound prompt sections by deterministic token counts; no model or network calls while building context

**Constraints**: Preserve the stored latest user message and strategy-specific system instructions unchanged; apply section budgets only to summary, recent history, and memories; keep recent messages and memory items whole; invalid environment configuration must raise an explicit error; one shared builder must serve all chat strategies including reflection wrappers

**Scale/Scope**: Existing `/chat` request path and all registered reasoning strategies; no change to public request/response shape, persistence schema, reasoning algorithms, or arena input format

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan |
|-----------|------|------|
| I. Explicit MVC Layers and Pure Domain Logic | Pass | Parse environment configuration at the application boundary; keep section selection, ordering, token measurement, and prompt formatting pure in the context builder; call it from chat-context composition. |
| II. Validate at Boundaries with Zod | Pass | Validate `CONTEXT_BUDGET` as a strict JSON object of non-negative integer section ceilings; retain existing HTTP validation and output schemas because the public contract is unchanged. |
| III. Represent Domain Errors Explicitly | Pass | Raise a dedicated context-budget configuration error for invalid environment values and report it explicitly rather than falling back to defaults. |
| IV. Tests and Quality Gates | Pass | Add deterministic unit and integration tests with fake strategies; run `npm run typecheck` and `npm test`. |
| V. Security by Default | Pass | Add no secrets; document only the non-secret budget setting in the environment example and do not read `.env`. |
| VI. Embedded SQLite Persistence | Pass | No persistence changes or database access are introduced. |

**Gate result**: PASS. Research decisions and project integration points are recorded in [research.md](./research.md); no clarification remains.

## Project Structure

### Documentation (this feature)

```text
specs/011-context-budgeting/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── checklists/
│   └── requirements.md
└── spec.md
```

No `contracts/` artifact is needed: the feature changes no external HTTP or CLI contract. Its internal prompt-building contract is captured in [data-model.md](./data-model.md).

### Source Code (repository root)

```text
src/
├── context/
│   ├── context-builder.ts
│   └── context-builder.test.ts
├── services/
│   ├── chat-service.ts
│   └── chat-service.test.ts
└── http/
    ├── server.ts
    └── server.test.ts
```

**Structure Decision**: Add a pure prompt-construction module under `src/context/`. Integrate its shared output at the existing chat-service composition seam, which is used before the selected strategy runs, including when wrapped for reflection. Keep storage and strategy-specific system prompts unchanged. Exercise all strategy registry entries through fake strategies in tests.

Document the optional `CONTEXT_BUDGET` JSON setting in `.env.example`; do not make it mandatory for startup because the built-in defaults are complete.

## Complexity Tracking

No constitution violations; no additional complexity justification is required.

## Phase 0: Research

See [research.md](./research.md). It records the environment format, token encoding, truncation rules, and existing integration seam.

## Phase 1: Design & Contracts

- [Data model and internal interface](./data-model.md): context sections, scoring and ordering, validation, and budget application.
- No external contract file: `/chat` request and response remain unchanged.
- [Quickstart](./quickstart.md): deterministic unit and service-boundary checks for configured and default budgets.

**Post-design Constitution Check**: PASS. Context selection remains pure, environment input is validated explicitly, no persistence or external API changes are introduced, and deterministic tests cover budget and preservation rules.
