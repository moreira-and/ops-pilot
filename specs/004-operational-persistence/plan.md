# Implementation Plan: Persistência Operacional

**Branch**: `004-operational-persistence` | **Date**: 2026-10-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-operational-persistence/spec.md`

## Summary

Replace the in-memory-only operational store used by the running application with a persistent
SQLite store, retaining the in-memory adapter for isolated tests and repeatable benchmarks. Seed a
stable five-service, six-alert Mercadinho scenario and three service-specific runbooks. Expose
incident listing and runbook lookup to the agent, and clarify all operational tool descriptions
and input schemas. No migration from the unconnected legacy MySQL artifacts is included.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode; Node.js 22.13+ (LTS) target. The planning
environment uses Node.js 24.21.0.

**Primary Dependencies**: Built-in `node:sqlite` `DatabaseSync`, Zod, LangChain tools, Express.
No new runtime database dependency is needed.

**Storage**: SQLite database at `OPSPILOT_DB`, default `./data/opspilot.db`; create its parent
directory when needed. Use `:memory:` for isolated tests and benchmarks. Four domain tables:
services, alerts, incidents, and runbooks.

**Testing**: `node:test` via `tsx`; targeted store and agent-tool tests, then `npm run typecheck`
and `npm test`.

**Target Platform**: Node.js 22.13+ LTS server environments. Node 22.13 is the baseline for using
`node:sqlite` without requiring an experimental launch flag.

**Project Type**: TypeScript web service with agent and CLI entry points.

**Performance Goals**: Preserve responsive operational tool calls for the existing single-process
service workload; no additional throughput target is specified.

**Constraints**: Use synchronous built-in SQLite; prepare statements for every query and bind all
values; never assemble SQL from input. Schema setup and seed must be idempotent. Enforce defined
closed domain values in the database. Keep the in-memory store available to tests and benchmarks.
Validate tool inputs and outputs with Zod, add `.describe()` metadata to every tool input field,
and surface persistence errors explicitly.

**Scale/Scope**: Four operational entity types; initial seed of five services, six alerts split
evenly between `firing` and `resolved`, and runbooks for checkout, payments, and auth. Incident
records can grow beyond the seed.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **MVC and pure domain logic**: Pass. SQLite I/O remains in the store adapter; services and
  controllers/tools continue to use the existing store/service boundaries.
- **Zod at boundaries**: Pass. New tool arguments and persisted/output records use Zod schemas.
- **Explicit domain errors**: Pass. Existing not-found behavior is preserved; storage failures
  must not become empty or success-shaped results.
- **Tests and quality gates**: Pass. New storage and tool behavior receives `node:test` coverage;
  typecheck and full test suite remain required.
- **Security by default**: Pass. No credentials are required; SQL values are bound, and generated
  database files are kept out of version control.
- **Embedded SQLite persistence**: Pass. The application uses built-in SQLite, prepared
  statements, closed-value checks, and in-memory test/benchmark stores.

No constitution violations or additional project complexity require an exception.

## Project Structure

### Documentation (this feature)

```text
specs/004-operational-persistence/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── operational-tools.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── tools.ts             # Operational tool schemas and descriptions
│   ├── tools.test.ts        # Tool behavior using isolated stores
│   └── plan-and-execute.ts  # Tool selection/execution for the second strategy
├── services/
│   ├── operational-store.ts # Store and domain contracts
│   ├── in-memory-operational-store.ts
│   ├── incident-service.ts  # Incident use cases
│   └── runbook-service.ts   # Runbook lookup use case
├── store/
│   ├── sqlite-ops-store.ts  # Persistent adapter implementing OperationalStore
│   └── sqlite-ops-store.test.ts
├── scripts/
│   ├── demo-data.json       # Reproducible seed data
│   └── demo-runbooks.ts     # Service-specific initial procedures
├── bench.ts                 # Retains isolated in-memory scenarios
├── bench.test.ts            # Benchmark scenario behavior
└── .gitignore               # Excludes local database files
```

**Structure Decision**: Keep the current single TypeScript service structure. Implement SQLite as
an adapter at the explicitly requested `src/store/sqlite-ops-store.ts` path for the existing store
abstraction, inject its persistent instance into the default operational-tool composition, and
keep in-memory instances explicitly injected by tests and benchmark scenarios. Extend both agent
strategy tool-routing surfaces and exclude the local database directory from version control.
Update the README's database and operational-state documentation. No separate project or new
database package is needed.

## Complexity Tracking

No constitution violations or unjustified architectural complexity.
