# Production Graph and Chat Contract

## Graph routing

The graph accepts a non-empty, context-enriched request and an optional strategy override. It executes exactly one of:

- `react`
- `plan-and-execute`
- `reflect:react`

When the override is absent, the router uses structured output with the fields below and applies the routing policy documented in [data-model.md](../data-model.md).

```json
{
  "route": "react",
  "reason": "The request is a direct, bounded alert lookup."
}
```

The route must be one of the three supported identifiers. The reason must be non-empty and safe to show to the caller. Invalid model output or a routing failure fails the request; it must not trigger an implicit route fallback.

## Trace

Each successful chat result contains a single ordered trace. Every event has:

```json
{
  "sequence": 0,
  "type": "route",
  "node": "router",
  "route": "react",
  "reason": "The request is a direct, bounded alert lookup.",
  "source": "router"
}
```

`source` is `router` for automatic selection and `override` for a caller-supplied strategy. Strategy events are attributed to `strategy-react`, `strategy-plan-and-execute`, or `strategy-reflect-react`, matching the selected route. Graph and strategy events use one contiguous sequence. The final answer event is attributed to `response`; context-prepared and summary events are attributed to `context`. The graph does not duplicate an answer event emitted by a delegated strategy. Trace events must not expose hidden chain-of-thought or the full private context.

## `POST /chat`

The endpoint preserves existing request and response fields while making `strategy` optional.

### Request

```json
{
  "message": "Summarize the active production alert",
  "userId": "operator-1",
  "strategy": "react",
  "reflact": false,
  "conversationId": "optional-conversation-id"
}
```

| Property | Type | Required | Behavior |
|----------|------|----------|----------|
| `message` | string | Yes | Non-empty after trimming |
| `userId` | string | Yes | Non-empty after trimming; existing chat identity input |
| `strategy` | string | No | If omitted, route automatically; if present, must match one of the three graph routes and overrides model routing |
| `reflact` | boolean | No | Retains the existing reflection compatibility option |
| `conversationId` | string | No | Continues the identified conversation under the existing chat contract |

### Success: `200 OK`

Returns the existing validated chat result fields, including `answer`, `trace`, `metrics`, and `conversationId`. The trace uses the node-aware contract above. Automatic routing includes the router model invocation in `metrics.llmCalls`; an explicit override does not.

### Errors

Existing status and response formats remain in effect. In particular:

| Status | Condition |
|--------|-----------|
| `400 Bad Request` | Request fails Zod validation |
| `422 Unprocessable Entity` | `strategy` does not match a registered graph route |
| `504 Gateway Timeout` | Graph execution exceeds the configured chat deadline |
| `500 Internal Server Error` | Router failure, invalid router output, invalid strategy result, or unexpected execution failure |

An error response must not contain a successful answer, trace, or metrics payload.

## Selection precedence

- A valid `strategy` bypasses automatic routing and is recorded with `source: override`.
- Without `strategy`, the structured router chooses one route and provides its reason.
- The existing `reflact` option remains supported; an already reflected `reflect:react` route must not be wrapped in Reflection a second time.
