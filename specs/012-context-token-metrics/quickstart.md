# Quickstart: Context Token Metrics

1. `npm run typecheck && npm test` — covers estimator, usage capture (present/absent), breakdown, `/chat` schema.
2. `npm run dev` in one terminal; in another: `./conversa-longa.sh` — expect one `promptTokens` line per turn, growing as history accumulates.
3. `curl` a `/chat` call and check `metrics.promptTokens` and `metrics.contextBreakdown` per [contract](./contracts/chat-metrics.md).
