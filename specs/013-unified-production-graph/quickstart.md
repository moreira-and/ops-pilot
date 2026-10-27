# Quickstart: Grafo unificado de produção

## Prerequisites

- Node.js 22 and dependencies installed from the project lockfile.
- `OPENROUTER_API_KEY` and `OPENROUTES_MODEL` in the runtime environment for live automatic-routing and strategy runs.
- No provider credentials are needed for deterministic graph and HTTP tests.

## Run deterministic checks

```sh
npm run typecheck
npm test
```

Expected outcome: strict TypeScript checking passes, and all existing plus unified-graph tests pass without network access.

For focused validation while implementing:

```sh
node --import tsx --test src/agents/production-graph.test.ts src/http/server.test.ts
```

Expected outcome: deterministic tests cover all three automatic routes, strategy override without router invocation, malformed route rejection, per-event `node` metadata, trace ordering, router metrics, and the HTTP success/error shapes.

## Validate `/chat`

Start the application using the existing development command:

```sh
npm run dev
```

Send a valid request without `strategy` to exercise automatic routing, then send another with `strategy` set to `react`, `plan-and-execute`, or `reflect:react` to exercise the override. Use a valid `userId` as required by the existing chat API.

Expected outcome:

- Automatic selection returns one supported route and a non-empty decision reason in the `route` trace event.
- The explicit route is executed without a router model call and the trace records `source: override`.
- Every returned trace event contains `node`; `sequence` is contiguous across graph and delegated strategy events.
- Success preserves the existing chat response and metrics fields; route model calls are counted only for automatic selection.

See [the production graph contract](./contracts/production-graph.md) and [the data model](./data-model.md) for exact values and validation rules.
