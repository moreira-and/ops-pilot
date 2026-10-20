# Quickstart: Provider Status Check

## Prerequisites

- Node.js 22 LTS and the repository's installed dependencies.
- Work from the repository root.

## Validation

Run the focused agent-tool tests:

```sh
node --import tsx --test src/agents/tools.test.ts
```

Expected outcome: tests pass for both providers, the GitHub default, compact successful results, timeout and retry bounds, retryable failures, malformed responses, and readable failure results. All network interactions in these tests use an injected fake fetch.

Run the repository quality gates:

```sh
npm run typecheck
npm test
```

Expected outcome: type checking succeeds and the full test suite passes.

For input, response, and failure behavior, see [the tool contract](contracts/check-provider-status.md). For entity validation rules, see [the data model](data-model.md).
