# Chat HTTP Contract

## `POST /chat`

Accepts a JSON request and executes one of the supported reasoning strategies through the production graph.

### Request

```json
{
  "message": "Summarize the active production alert",
  "strategy": "react",
  "reflact": false
}
```

| Property | Type | Required | Behavior |
|----------|------|----------|----------|
| `message` | string | Yes | Must be non-empty after trimming |
| `strategy` | string | No | When omitted, the graph selects a strategy automatically. When supplied, must be `react`, `plan-and-execute`, or `reflect:react` and bypasses the router. |
| `reflact` | boolean | No | Defaults to `false`; when true, applies reflection to the selected strategy unless `strategy` is already `reflect:react`. |

### Success: `200 OK`

Returns the result fields validated by the reasoning result schema:

```json
{
  "answer": "The alert is firing for the checkout service.",
  "trace": [],
  "metrics": {
    "llmCalls": 1,
    "latencyMs": 25
  }
}
```

The example's trace is abbreviated. Every trace event has a contiguous `sequence` and a `node` identifying its producer. Automatic selection adds a `route` event with the selected route, a non-empty reason, and `source: "router"`; an explicit `strategy` adds the same event with `source: "override"`.

### Errors

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Missing JSON body or valid JSON that fails the request schema | `{"error":"Invalid request body","issues":[...]}` where `issues` contains Zod validation issues |
| `400 Bad Request` | JSON syntax is malformed | `{"error":"Invalid JSON"}` |
| `422 Unprocessable Entity` | Strategy is not one of the supported routes | `{"error":"Unknown strategy","strategy":"..."}` |
| `504 Gateway Timeout` | Strategy has not completed within 180 seconds | `{"error":"Strategy execution timed out"}` |
| `500 Internal Server Error` | Unexpected execution failure or invalid strategy result | `{"error":"Internal server error"}` |

The precise human-readable text may vary; status and data fields are part of the contract. Error responses must not contain a successful result payload.

### Execution Rules

- Request validation occurs before strategy resolution and execution.
- An omitted strategy invokes the structured router, which selects exactly one of `react`, `plan-and-execute`, or `reflect:react`.
- A supplied supported strategy bypasses the router and is recorded as an override in the trace.
- Strategy selection occurs before the timeout is started; the 180-second deadline bounds execution.
- The production timeout is 180,000 milliseconds. Tests may inject a shorter deadline through the application factory.
- The service listens on `PORT`, defaulting to 3000, when started by the existing development entrypoint.
- A timeout response does not guarantee cancellation of the strategy's underlying work because the current strategy interface has no cancellation contract.
- No external network services are called by the HTTP boundary itself.
