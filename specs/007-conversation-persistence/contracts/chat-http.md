# Chat HTTP Contract: Persistent Conversations

## `POST /chat`

Accepts a chat request, optionally continuing a persistent conversation, and executes one registered reasoning strategy.

### Request

```json
{
  "message": "Summarize the active production alert",
  "strategy": "react",
  "reflact": false,
  "conversationId": "opaque-conversation-id"
}
```

| Property | Type | Required | Behavior |
|----------|------|----------|----------|
| `message` | string | Yes | Must be non-empty after trimming |
| `strategy` | string | No | Defaults to `react`; must match a registered strategy |
| `reflact` | boolean | No | Defaults to `false`; when true, applies reflection to the selected strategy |
| `conversationId` | string | No | When omitted, starts a conversation; when supplied, must identify an existing conversation |

### Success: `200 OK`

Returns the validated reasoning result, the active conversation ID, and the count of prior messages included in the strategy input:

```json
{
  "answer": "The alert is firing for the checkout service.",
  "trace": [],
  "metrics": {
    "llmCalls": 1,
    "latencyMs": 25,
    "historyMessages": 4
  },
  "conversationId": "opaque-conversation-id"
}
```

The example's trace is abbreviated. `historyMessages` is an integer from 0 through 8 (superseded 12; see feature 010) and excludes the current user message and the reply being generated. The conversation ID is returned for both newly created and continued conversations.

### Errors

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Missing JSON body or request fails validation | `{"error":"Invalid request body","issues":[...]}` |
| `400 Bad Request` | JSON syntax is malformed | `{"error":"Invalid JSON"}` |
| `404 Not Found` | Supplied conversation ID does not exist | Error response identifying the missing conversation; no successful result fields |
| `422 Unprocessable Entity` | Strategy name is not registered | `{"error":"Unknown strategy","strategy":"..."}` |
| `504 Gateway Timeout` | Strategy has not completed within the configured deadline | `{"error":"Strategy execution timed out"}` |
| `500 Internal Server Error` | Unexpected strategy failure, invalid result, or conversation persistence failure | `{"error":"Internal server error"}` |

No error response includes a successful `answer`, `trace`, `metrics`, or `conversationId` payload.

### Execution Rules

- Validate the request with Zod before resolving the strategy or accessing conversation data.
- Resolve the requested strategy before running the chat operation; an unknown strategy does not create or mutate a conversation.
- An omitted `conversationId` creates a new conversation. A supplied ID is checked before strategy execution and is never silently replaced.
- Retrieve at most the 8 most recent (feature 010; older messages are summarized) earlier messages and pass the chat strategy boundary `{ message, history }`, where `history` is the bounded chronological list of role-preserving messages.
- The HTTP adapter composes prior messages with explicit `User`/`Assistant` labels and appends the current user message last when calling the existing reasoning strategy.
- `metrics.historyMessages` equals the number of prior messages actually included in that composed input.
- Validate the reasoning result before persisting the assistant reply. Append messages using the conversation store; a persistence error fails the request instead of returning a success result.
- Preserve the existing strategy timeout behavior and reflection selection.
- Validate the complete success response with Zod before returning status 200.
