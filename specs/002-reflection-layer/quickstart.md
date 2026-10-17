# Quickstart: Camada Reflection

This guide validates the Reflection decorator and the Arena selectors without making external model or database calls in unit tests.

## Prerequisites

- Node.js 22 LTS.
- Project dependencies installed with `npm install`.
- No OpenRouter or MySQL credentials are needed for the deterministic tests.

## Run focused verification

```sh
npm run typecheck
node --import tsx --test src/agents/reflection.test.ts src/arena.test.ts
```

Expected outcomes:

- TypeScript exits successfully.
- Reflection tests cover immediate approval, rejection followed by regeneration, default and zero bounds, rejection exhaustion, invalid critic output or errors, trace ordering, and model-call aggregation.
- Arena tests verify `reflect:react` and `reflect:plan-and-execute` select the corresponding decorated strategy while existing selectors continue to work.

## End-to-end Arena run

Configure the same model settings used by existing strategies, then run:

```sh
npm run arena -- --input "Summarize firing alerts" --strategies reflect:react,reflect:plan-and-execute
```

Expected output includes one result per selected strategy with its answer, ordered trace, and aggregate metrics. Critique events include approval and feedback. Model access is required for this manual scenario; the command can execute tools again after a rejected candidate.

See [the strategy contract](./contracts/reasoning-strategies.md) and [the Arena contract](./contracts/arena-cli.md) for behavior and output details.
