# Data Model: API HTTP do Chat

This feature is stateless. The entities below describe data crossing the HTTP boundary or used to resolve an execution; none is persisted.

## Chat Request

| Field | Type | Required | Validation / default |
|-------|------|----------|----------------------|
| `message` | string | Yes | Trimmed and non-empty; validated against the reasoning input contract |
| `strategy` | string | No | Non-empty strategy name; defaults to `react` |
| `reflact` | boolean | No | Defaults to `false`; when true, requests reflection |

The HTTP request schema rejects values of the wrong type. Schema issues are returned in the 400 response. A well-formed but unregistered strategy name is handled separately as 422.

## Strategy Registry Entry

| Attribute | Type | Description |
|-----------|------|-------------|
| `name` | string | Public selection key, such as `react` or `plan-and-execute` |
| `strategy` | `ReasoningStrategy` | Implementation selected for the request |

The registry is read-only for each request. If reflection is enabled, the selected strategy is decorated for that execution; the registered base strategy is not mutated.

## Chat Result

The successful response is the validated reasoning result:

| Field | Type | Description |
|-------|------|-------------|
| `answer` | string | Final strategy answer |
| `trace` | array of trace events | Ordered reasoning/tool event trace as defined by the existing reasoning contract |
| `metrics` | object | Execution metrics: non-negative `llmCalls` and `latencyMs` |

Validate the complete result with `reasoningResultSchema` before returning status 200.

## HTTP Error

Errors are not successful chat results and do not include `answer`, `trace`, or `metrics`.

| Status | Condition | Response data |
|--------|-----------|---------------|
| 400 | Request body fails Zod validation | Error code/message and Zod `issues` |
| 422 | Strategy name is not registered | Error code/message identifying the requested strategy |
| 504 | Strategy execution exceeds its deadline | Error code/message identifying timeout |
| 500 | Strategy execution fails unexpectedly or returns invalid output | Generic error code/message without leaking internal exception details |

## Execution Flow

1. Parse the request body and apply documented defaults.
2. Resolve the base strategy by name; fail with 422 if absent.
3. If `reflact` is true, wrap the selected base strategy with the existing reflection helper.
4. Execute with the request's message under the configured deadline.
5. Parse the result with the existing result schema and return it, or translate the failure at the HTTP boundary.
