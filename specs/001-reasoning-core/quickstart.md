# Quickstart: Núcleo de raciocínio do OpsPilot

## Prerequisites

- Node.js 22 and the dependencies installed from the project lockfile.
- OpenRouter settings `OPENROUTER_API_KEY` and `OPENROUTES_MODEL` for model-backed arena runs.
- Set credentials in the local runtime environment or an ignored `.env` file; do not place real credentials in committed files or command history. Seed and deterministic tests do not require provider credentials.

## Seed the demonstration records

Run the repeatable seed command:

```sh
npm run seed:demo
```

Expected outcome: the command validates and loads the six services and seven alerts from `src/scripts/demo-data.json` into an in-memory store, including the `catalog` service and alert, with four `firing` and three `resolved`. No database connection is required; operational changes are scoped to the running process and reset at the next start.

## Run the deterministic checks

```sh
npm run typecheck
npm test
```

Expected outcome: the source passes strict TypeScript checking, and store/trace tests pass without OpenRouter or a database.

## Run the arena

```sh
npm run arena -- --input "List the firing alerts and summarize their services" --strategies react,plan-and-execute --max-iterations 8
```

Expected outcome: each selected strategy prints its own answer, ordered typed trace, `llmCalls`, and `latencyMs`. Runs are sequential and tool mutations are visible to later tools in the same process only.

For argument semantics and output requirements, see [contracts/arena-cli.md](./contracts/arena-cli.md). For the strategy and tool result shapes, see [contracts/reasoning-strategies.md](./contracts/reasoning-strategies.md); for the seed fixture and in-memory records, see [data-model.md](./data-model.md).
