# Quickstart: Persistência Operacional

## Prerequisites

- Node.js 22.13+ LTS and npm.
- Project dependencies installed with `npm install`.
- No OpenRouter credentials are required for the storage and tool tests.
- An OpenRouter key and model are required only to exercise the chat agent end to end.

## Validate the feature

1. Run the focused persistence and operational-tool tests:

   ```sh
   node --import tsx --test src/store/sqlite-ops-store.test.ts src/agents/tools.test.ts
   ```

   Expected: the SQLite tests use isolated in-memory databases for store behavior and a temporary
   database file for reopen/persistence checks; the tool tests validate defaults, accepted
   filters, incident lifecycle, runbook lookup, and explicit failures.

2. Run the project type check:

   ```sh
   npm run typecheck
   ```

   Expected: TypeScript exits successfully with no diagnostics.

3. Run the full test suite:

   ```sh
   npm test
   ```

   Expected: existing strategy, service, and CLI tests pass along with the new persistence tests.

4. Validate persistence across process lifetimes by using one temporary database path:

   ```sh
   OPSPILOT_DB=/tmp/opspilot-quickstart.db npm run dev
   ```

   Configure OpenRouter, create or resolve an incident through the agent, stop the process,
   restart it with the same `OPSPILOT_DB`, and list incidents. Expected: the same incident and
   state are returned. The store tests should additionally verify persistence by reopening the
   same database path without calling an external model.

5. Validate seed idempotence by running `npm run seed:demo` twice with the same database path.
   Expected: five services,
   six alerts (three firing and three resolved), and the three specified runbooks remain available,
   without duplicate seed records or removal of incidents created after initialization.

For the domain fields and state transitions, see [data-model.md](./data-model.md). Tool input,
defaults, and failure behavior are defined in [contracts/operational-tools.md](./contracts/operational-tools.md).

## Validation recorded

- `npm test`: 68 tests passed.
- `npm run typecheck`: passed.
- `OPSPILOT_DB=<temporary database path> npm run seed:demo`, run twice against the same path:
  both runs reported five services and six alerts (three firing and three resolved).
