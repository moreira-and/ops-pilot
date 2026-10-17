# Implementation Plan: API HTTP do Chat

**Branch**: `003-chat-http-api` | **Date**: 2026-10-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-chat-http-api/spec.md`

## Summary

Expose the existing reasoning strategies through a JSON `POST /chat` endpoint. Validate request and response boundaries with Zod, resolve strategies from a registry, optionally decorate the selected strategy with the existing `withReflection` helper, and bound each execution to 180 seconds. Export an Express application factory with injected strategies, reflection decorator and timeout settings so integration tests can run deterministically without external services.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS

**Primary Dependencies**: Express 5, Zod 4, existing reasoning agents and `withReflection`

**Storage**: N/A; chat request and response data are not persisted by this feature

**Testing**: `node:test` via `tsx`; integration tests in `src/http/server.test.ts`

**Target Platform**: Node.js HTTP service

**Project Type**: Backend web service

**Performance Goals**: Return a timeout response no later than 180 seconds after strategy execution starts; return completed strategy results immediately

**Constraints**: Validate external request and response data with Zod; no external network/model calls in integration tests; preserve existing `ReasoningStrategy` contract; return 504 at timeout without claiming execution cancellation, which the current strategy interface does not support

**Scale/Scope**: One stateless endpoint and an in-memory mapping of names to reasoning strategies; no persistence, authentication, or API versioning changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan |
|-----------|------|------|
| I. Explicit MVC Layers and Pure Domain Logic | Pass | HTTP parsing/status translation stays in the Express boundary; strategy lookup/decorating is a small agent-registry responsibility; no persistence or domain I/O is introduced. |
| II. Validate at Boundaries with Zod | Pass | Parse the request body with a Zod schema and parse the returned `ReasoningResult` before serializing it. |
| III. Represent Domain Errors Explicitly | Pass | Use an explicit unknown-strategy error/result for the 422 translation; validation and timeout are boundary failures with their specified statuses. Unexpected failures reach an explicit 500 handler rather than being shaped as success. |
| IV. Tests and Quality Gates | Pass | Add deterministic `node:test` integration coverage; implementation must pass `npm run typecheck` and `npm test`. |
| V. Security by Default | Pass | No secrets, environment-file inspection, persistence, or external service calls are needed for the test path. |

**Gate result**: PASS. No constitution violations or unresolved design clarifications.

## Project Structure

### Documentation (this feature)

```text
specs/003-chat-http-api/
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
├── agents/
│   └── index.ts             # Default strategy registry and optional reflection wrapper
├── http/
│   ├── server.ts            # Express application factory and POST /chat boundary
│   └── server.test.ts       # Deterministic HTTP integration tests
└── index.ts                 # Start the HTTP listener for the existing npm run dev entrypoint
```

**Structure Decision**: Add the requested HTTP boundary and shared agent registry under the existing `src/` TypeScript project, and wire the existing `npm run dev` entrypoint to start the app. Keep test files alongside their implementation as required by the repository's `node:test` glob. The app factory receives a strategy registry, reflection decorator and timeout override; production defaults remain the real registered agents, existing `withReflection` helper and 180 seconds.

## Complexity Tracking

No constitution violations; no additional complexity justification is required.

## Phase 0: Research

See [research.md](./research.md). All technology and integration choices were resolved from the existing project stack and code; no `NEEDS CLARIFICATION` items remain.

## Phase 1: Design & Contracts

- [Data model](./data-model.md): request, registry, result, and HTTP error shapes.
- [HTTP contract](./contracts/chat-http.md): endpoint request, responses, validation and timeout semantics.
- [Quickstart](./quickstart.md): deterministic integration validation commands and expected outcomes.

**Post-design Constitution Check**: PASS. The design preserves the controller boundary, validates ingress and egress with Zod, keeps strategy execution behind the existing reasoning interface, and specifies deterministic tests and explicit error translation.
