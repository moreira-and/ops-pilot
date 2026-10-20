# Research: Persistência Operacional

## Built-in SQLite runtime support

**Decision**: Use Node.js `node:sqlite` and `DatabaseSync` without an external database package.
For the project runtime, require Node.js 22.13.0 or newer within the Node 22 line, where SQLite no
longer needs the experimental CLI flag.

**Rationale**: The API was introduced in Node 22.5.0. Node 22.13.0 removed the requirement for
`--experimental-sqlite`; the API is still marked Stability 1.1 (Active development). This
provides the requested embedded store while making normal project commands work without an
experimental runtime flag.

**Alternatives considered**:

- Use Node 22.5-22.12 with `--experimental-sqlite` added to every entry point; rejected to avoid
  making normal development and test commands depend on an experimental launch flag.
- Use a separately installed SQLite library or traditional database server; rejected because the
  feature and constitution require the built-in SQLite API and an embedded database.

**Sources**:

- [Node.js v22 SQLite API](https://nodejs.org/docs/latest-v22.x/api/sqlite.html)
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)

## Prepared statements and query execution

**Decision**: Prepare each dynamic read/write statement once and pass user or domain values only
through positional or named bindings. Keep schema DDL and transaction-control SQL static; do not
build SQL text from input.

**Rationale**: `DatabaseSync.prepare()` creates a reusable statement, and the documented
`StatementSync` methods (`run`, `get`, `all`, and `iterate`) accept bound values. Node recommends
parameter binding for user input. Static SQL is needed for schema creation and transaction control;
no dynamic values are interpolated into it.

**Alternatives considered**:

- Build SQL using input interpolation; rejected because it violates the constitution and weakens
  injection safety.
- Re-prepare query text with interpolated values on every operation; rejected for the same reason.

**Sources**:

- [DatabaseSync.prepare](https://nodejs.org/docs/latest-v22.x/api/sqlite.html#databaseprepare)
- [StatementSync](https://nodejs.org/docs/latest-v22.x/api/sqlite.html#class-statementsync)

## Schema setup and seed transactions

**Decision**: Create the four domain tables using idempotent static DDL and enforce allowed status
and severity values with database `CHECK` constraints. Seed services, alerts, and runbooks inside a
transaction using prepared inserts with conflict handling that does not reset operational records.

**Rationale**: The required schema and seed must be safe to initialize more than once and must not
remove incidents created by operators. Grouping seed writes makes partial initialization
recoverable. Node's `DatabaseSync.exec()` runs static SQL; explicit transaction control can surround
the prepared-statement writes, with rollback on failure.

**Alternatives considered**:

- Delete and recreate seed tables on startup; rejected because it loses operational state.
- Use separate uncoordinated seed writes; rejected because an error could leave a partially seeded
  scenario.
- Assume a Node-provided transaction wrapper; not selected because the Node 22 API documents
  `exec()` and prepared statements, not a dedicated transaction wrapper.

**Sources**:

- [Node.js SQLite API](https://nodejs.org/docs/latest-v22.x/api/sqlite.html)
- [DatabaseSync.exec](https://nodejs.org/docs/latest-v22.x/api/sqlite.html#databaseexec)

## In-memory test and benchmark isolation

**Decision**: Construct the same SQLite store with `:memory:` for database-focused tests; keep the
existing in-memory store for deterministic agent-tool tests and benchmark scenario orchestration
where its current behavior is useful.

**Rationale**: Node documents `new DatabaseSync(':memory:')` for an isolated database. Keeping
the existing adapter preserves benchmark reproducibility and the current injection seam while
allowing direct SQLite behavior, constraints, and persistence to be tested without disk state.

**Alternatives considered**:

- Use a temporary persistent file for every store test; rejected because test state can leak across
  runs and cleanup becomes necessary.
- Replace all benchmark stores with the SQLite adapter; rejected because the feature explicitly
  keeps the in-memory mock for benchmarks and scenarios should remain reproducible.

**Sources**:

- [DatabaseSync constructor](https://nodejs.org/docs/latest-v22.x/api/sqlite.html#new-databasesyncpath-options)

## Synchronous database work

**Decision**: Keep store operations small and bounded, and use indexed keys for exact lookups.
Do not introduce asynchronous database wrappers or worker threads in this feature.

**Rationale**: `DatabaseSync` and `StatementSync` APIs execute synchronously and can block the
event loop while a query runs. The required seed and operational record sets are small; avoiding
large result scans and keeping work local is appropriate for the current service.

**Alternatives considered**:

- Move each operation to a worker or add an asynchronous native dependency; rejected as
  unnecessary for the current scale and contrary to the requested built-in synchronous interface.

**Sources**:

- [Node.js SQLite API](https://nodejs.org/docs/latest-v22.x/api/sqlite.html)
- [Don't block the event loop](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop)

## Runbook record shape

**Decision**: Store a unique runbook per service with a stable identifier, service identifier,
title, and instructional text.

**Rationale**: The current domain has no runbook type. A procedure title and text are the minimum
useful content needed for the `consultar_runbook(service)` tool to return a service-specific
procedure without executing it.

**Alternatives considered**:

- Store free-form serialized objects with no fields defined; rejected because validation and
  service-specific lookup would be ambiguous.
- Treat runbooks as agent prompt text outside persistence; rejected because runbooks are explicitly
  one of the four persisted entities.

## Existing MySQL artifacts

**Decision**: Do not add a migration from the existing Sequelize/MySQL models or migration
artifacts. Replace the in-memory operational store used by the active server and tools; retain
legacy persistence files only where they remain referenced.

**Rationale**: Repository documentation and code show that the active API and agent currently use
an in-memory operational store, while the MySQL adapters and migrations are not connected to that
flow. The current active operational state is therefore not available for migration after process
exit.

**Alternatives considered**:

- Migrate records from MySQL on startup; rejected because the current application does not use that
  database path and no active dataset or migration requirement was specified.
- Delete all existing MySQL model and migration code during this feature; rejected as unrelated
  cleanup that may affect other references.
