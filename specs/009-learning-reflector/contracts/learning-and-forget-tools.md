# Learning and Forget Tool Contracts

These are internal model/service contracts; this feature adds no new HTTP endpoint.

## Learning extractor

### Input

- The latest user-authored message for the current successful chat request only.
- Do not include assistant response text or earlier conversation turns.

### Structured result

```json
{
  "hasLearning": true,
  "fact": "The operator prefers incident updates by email."
}
```

| Field | Type | Rules |
|---|---|---|
| `hasLearning` | boolean | Required. False means no memory write. |
| `fact` | string | Required by the schema; trimmed. Must be non-empty when `hasLearning` is true. Must express an explicitly stated durable fact and exclude secrets. |

The result is validated before use. Invalid, ambiguous, blank, or secret-like candidates cause no write.

## Asynchronous lifecycle

1. The chat strategy returns a successful answer.
2. The conversation service persists the chat result.
3. It schedules learning for the latest user message and returns without awaiting extraction or memory persistence.
4. If `hasLearning` is true and the candidate passes validation/security checks, the service calls `MemoryStore.remember(userId, fact)`.
5. Failures are logged with sanitized error details. User messages and candidate fact contents are never included in logs. The already completed response is not changed.

Failed chat responses and invalid HTTP requests do not schedule learning.

## `forget_preference` agent tool

### Model-visible input

```json
{
  "preference": "incident updates by email"
}
```

`preference` is a non-empty natural-language description of the memory to forget. There is no `userId` or memory-ID field in the model-visible schema.

### Trusted owner identity

The tool obtains the requesting user's validated identity from the current LangGraph invocation context. Missing or invalid context fails closed before memory lookup. The owner identity is not inferred from prompt text or model output.

### Matching and outcomes

The tool searches only the current user's memories using semantic recall (at most three candidates; existing recall floor strictly greater than `0.3`). It deletes no more than one candidate and only when its score is at least `0.75` and leads every other returned candidate above `0.3` by at least `0.10`.

```json
{ "status": "deleted", "preference": "incident updates by email" }
```

```json
{ "status": "not_found" }
```

```json
{
  "status": "ambiguous",
  "candidates": [
    "The operator prefers incident updates by email.",
    "The operator prefers weekly status summaries by email."
  ]
}
```

The `ambiguous` outcome makes no changes and lets the agent ask the user which preference to remove. Candidate facts, when returned, are limited to the requesting user's own memories. Storage, embedding, and validation failures are surfaced as tool errors; they are not mapped to `deleted` or `not_found`.
