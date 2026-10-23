# Chat HTTP Contract: Semantic Memory

## `POST /chat`

Accepts a chat request and supplies user-scoped semantic memories to the reasoning context.

### Request

```json
{
  "message": "What should I check before deploying?",
  "userId": "user-123",
  "strategy": "react",
  "reflact": false,
  "conversationId": "optional-conversation-id"
}
```

| Property | Type | Required | Behavior |
|---|---|---|---|
| `message` | string | Yes | Must be non-empty after trimming |
| `userId` | string | Yes | Must be non-empty after trimming; scopes all memory retrieval |
| `strategy` | string | No | Defaults to `react`; must match a registered strategy |
| `reflact` | boolean | No | Defaults to `false`; when true, applies reflection to the selected strategy |
| `conversationId` | string | No | Existing conversation continuation behavior is unchanged |

### Success: `200 OK`

Returns the existing validated reasoning result and, when applicable, its existing conversation ID and metrics. Retrieved memory facts affect the reasoning context but are not exposed as a new response field.

```json
{
  "answer": "Check the canary and rollback plan first.",
  "trace": [],
  "metrics": {
    "llmCalls": 1,
    "latencyMs": 25,
    "historyMessages": 0
  },
  "conversationId": "optional-conversation-id"
}
```

Response fields retain the currently configured chat contract; memory does not add response fields.

### Errors

| Status | Condition | Body |
|---|---|---|
| `400 Bad Request` | Request is missing `userId` or fails validation | `{"error":"Invalid request body","issues":[...]}` |
| `422 Unprocessable Entity` | Strategy name is not registered | `{"error":"Unknown strategy","strategy":"..."}` |
| `404 Not Found` | Supplied conversation ID does not exist | Existing conversation-not-found response |
| `500 Internal Server Error` | Embedding or memory persistence/recall fails, or strategy fails | `{"error":"Internal server error"}` |

No error response includes a successful answer. An empty eligible-memory result is not an error; model or store failures are not converted into an empty result.

### Execution Rules

- Validate the request with Zod before memory access.
- Retrieve memories using only the supplied `userId`. Never retrieve or compare another user's records.
- Sort matching facts by descending dot product, select at most the top three, then exclude selected facts whose dot product is less than or equal to `0.3`.
- Complete recall before strategy execution; a memory failure fails the request rather than silently dropping context.
- Preserve existing conversation-history composition, strategy selection, timeout, reflection, and response validation behavior.
- `remember`, `recall`, and `forget` are internal service/store operations; this feature adds no public memory-management endpoint.
