# Implementation Plan: Provider Status Check

**Branch**: `005-provider-status-check` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-provider-status-check/spec.md`

## Summary

Add a `check_provider_status` agent tool that retrieves GitHub or Cloudflare's public status observation and returns its indicator and description on one line. Keep provider selection restricted to the two supported services with GitHub as the default. Bound each attempt to five seconds, retry one time only for network failures, timeouts, and server errors, validate the expected status object, and convert final failures into readable tool results. Inject the fetch function so tests use deterministic fake responses without network access.

## Technical Context

**Language/Version**: TypeScript ESM, Node.js 22 LTS, strict type checking

**Primary Dependencies**: `@langchain/core` agent tools, Zod 4, Node.js native `fetch` and `AbortSignal.timeout`

**Storage**: N/A; status observations are not persisted

**Testing**: `node:test` via `tsx`, in `src/agents/tools.test.ts`

**Target Platform**: Node.js server

**Project Type**: Agent-backed web service

**Performance Goals**: A request attempt finishes or times out within five seconds; no more than two attempts per check

**Constraints**: Only fixed GitHub and Cloudflare public status endpoints; no credentials; validate `{ status: { indicator, description } }`; retry network/timeout and HTTP 5xx failures once; return readable tool-result text for final failures; no live network in tests

**Scale/Scope**: One additional agent tool and focused tests; no database, API route, or persistent state changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Explicit MVC Layers and Pure Domain Logic**: Pass. This is an agent capability, consistent with existing tools in `src/agents/tools.ts`; the status check is an external-effect boundary and does not introduce domain or persistence logic.
- **II. Validate at Boundaries with Zod**: Pass. Validate the provider input and the external status payload with Zod.
- **III. Represent Domain Errors Explicitly**: Pass with boundary-specific behavior. External check failures are observations explicitly required to be returned as tool-result text, not thrown outside this tool; no domain error or HTTP response is introduced.
- **IV. Tests and Quality Gates**: Pass. Add deterministic tests with `node:test` and an injected fake fetch; implementation must pass `npm run typecheck` and `npm test`.
- **V. Security by Default**: Pass. Use a closed provider enum and fixed endpoint mapping; no secrets or arbitrary user-provided URLs.
- **VI. Embedded SQLite Persistence**: Pass. No operational data is persisted and no database access is added.

No constitution violations or unresolved clarifications.

## Project Structure

### Documentation (this feature)

```text
specs/005-provider-status-check/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── check-provider-status.md
```

### Source Code (repository root)

```text
src/
└── agents/
    ├── tools.ts          # Add the provider status tool and its input schema
    └── tools.test.ts     # Cover provider selection, success, retries, timeout, and invalid payload
```

**Structure Decision**: Use the existing agent tool module and its adjacent test file. Keep the capability within the established agent boundary; do not add a service, model, API route, or storage layer for a single read-only external observation.

## Complexity Tracking

No constitution violations.
