# Quickstart: Context Budgeting

## Prerequisites

- Node.js 22 LTS and project dependencies installed.
- No model-provider credentials or external services are needed for the context-builder and fake-strategy checks.
- Do not inspect or load `.env` when running these validation commands.
- `CONTEXT_BUDGET` is an optional JSON object. For example: `{"summary":80,"history":400,"memories":120}`. Omitted sections use defaults (200, 1,200, and 300 tokens); invalid JSON, unknown keys, or negative/non-integer values fail application creation with an explicit configuration error.

## Validate the builder

Run the focused unit tests:

```sh
node --import tsx --test src/context/context-builder.test.ts
```

Expected outcomes:

- Default limits are 200, 1,200, and 300 tokens for summary, history, and memories.
- Partial `CONTEXT_BUDGET` JSON overrides are merged with defaults; malformed or invalid configuration raises the explicit configuration error.
- Oversized summary, history, and memory sections stay within their respective token ceilings.
- Oldest history messages and lowest-scoring memories are removed first; equal-score handling is deterministic.
- System instructions and the latest user message remain unchanged.

## Validate chat integration

Run the service and HTTP tests, which use fake strategies and do not call model providers:

```sh
node --import tsx --test src/services/chat-service.test.ts src/http/server.test.ts
node --import tsx --test src/agents/react.test.ts src/agents/plan-and-execute.test.ts
```

Expected outcomes:

- Existing chat-history ordering and persistence behavior remain unchanged.
- Each supported chat strategy receives the budgeted composition through the shared dispatch path.
- Both reasoning strategies and their reflection-decorated paths use the same context limits.
- The latest message saved to conversation history is identical to the original request.

## Run repository quality gates

```sh
npm run typecheck
npm test
```

Both commands must pass. The feature does not change the HTTP request or response contract.
