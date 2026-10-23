# Quickstart: Learning Reflector Validation

## Prerequisites

- Node.js 22 LTS and project dependencies installed.
- No live model credentials or network access are required for the deterministic test suite; tests inject the extractor.

## Validation

Run focused tests once implementation is complete:

```bash
node --import tsx --test \
  src/services/learning-service.test.ts \
  src/services/memory-safety.test.ts \
  src/services/preference-forget-service.test.ts \
  src/services/chat-service.test.ts \
  src/agents/tools.test.ts \
  src/agents/react.test.ts \
  src/agents/reflection.test.ts \
  src/agents/plan-and-execute.test.ts \
  src/http/server.test.ts
```

Run all type and regression checks:

```bash
npm run typecheck
npm test
```

The focused tests should verify that:

- A successful chat schedules extraction using only the latest user message.
- The response completes while an injected extractor or memory write remains pending.
- An eligible fact is remembered for the same `userId`; a one-off request, invalid output, or detected secret results in no memory write.
- Background failures are logged without changing the completed response or logging message/fact contents.
- `forget_preference` has no model-controlled owner field, uses the trusted request context, removes only a unique high-confidence same-user match, and returns ambiguity or no-match outcomes without deleting anything.
- Missing/invalid identity, memory failures, and deletion failures do not produce success-shaped tool results.

## Manual end-to-end check

1. Start the application with its normal model configuration and a temporary SQLite database path.
2. Send a `/chat` request with a valid `userId` and a durable preference.
3. Confirm the HTTP response returns without waiting for the learning model; watch the server terminal for `Durable user memory learned.` before sending the follow-up request. This content-free log is emitted only after persistence succeeds. The in-process task is best effort and not a durable queue.
4. In a subsequent request from the same `userId`, ask a semantically related question and verify that the learned fact informs the answer.
5. Ask the agent to forget that preference with either supported strategy (`react` or `plan-and-execute`); verify it confirms deletion only after the tool reports `deleted`.
6. Ask again and verify the fact is no longer available. Repeat with another user ID to verify isolation.

See [learning-and-forget-tools.md](./contracts/learning-and-forget-tools.md) for the extractor and tool data contracts, and [data-model.md](./data-model.md) for outcome semantics.
