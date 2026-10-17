# Chat HTTP Contract

## `POST /chat`

Accepts a JSON request and executes one registered reasoning strategy.

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
| `strategy` | string | No | Defaults to `react`; must match a registered strategy |
| `reflact` | boolean | No | Defaults to `false`; when true, applies reflection to the selected strategy |

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

The example's trace is abbreviated; actual trace events retain the sequence and event schema produced by the selected strategy.

### Errors

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Missing JSON body or valid JSON that fails the request schema | `{"error":"Invalid request body","issues":[...]}` where `issues` contains Zod validation issues |
| `400 Bad Request` | JSON syntax is malformed | `{"error":"Invalid JSON"}` |
| `422 Unprocessable Entity` | Strategy name is not registered | `{"error":"Unknown strategy","strategy":"..."}` |
| `504 Gateway Timeout` | Strategy has not completed within 180 seconds | `{"error":"Strategy execution timed out"}` |
| `500 Internal Server Error` | Unexpected execution failure or invalid strategy result | `{"error":"Internal server error"}` |

The precise human-readable text may vary; status and data fields are part of the contract. Error responses must not contain a successful result payload.

### Execution Rules

- Request validation occurs before strategy resolution and execution.
- An omitted strategy selects the registered `react` strategy.
- Strategy selection occurs before the timeout is started; the 180-second deadline bounds execution.
- The production timeout is 180,000 milliseconds. Tests may inject a shorter deadline through the application factory.
- The service listens on `PORT`, defaulting to 3000, when started by the existing development entrypoint.
- A timeout response does not guarantee cancellation of the strategy's underlying work because the current strategy interface has no cancellation contract.
- No external network services are called by the HTTP boundary itself.
