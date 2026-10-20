# Agent Tool Contract: `check_provider_status`

## Purpose

Check a supported provider's public overall status during an incident investigation, especially when determining whether a dependency outage is external or local.

## Input

| Field | Type | Required | Default | Description |
|---|---|---:|---|---|
| `provider` | enum: `github`, `cloudflare` | No | `github` | Provider whose public status should be checked |

Unknown provider values are rejected by input validation and are never used to construct a URL.

## Provider mapping

| Provider | Public status endpoint |
|---|---|
| `github` | `https://www.githubstatus.com/api/v2/status.json` |
| `cloudflare` | `https://www.cloudflarestatus.com/api/v2/status.json` |

No credentials are required. Callers cannot supply endpoint URLs.

## Successful result

Accept only a payload with the shape:

```json
{
  "status": {
    "indicator": "string",
    "description": "string"
  }
}
```

Return the indicator and description as a compact single-line string; do not return the full payload.

## Failure and resilience behavior

- Each fetch attempt has a five-second timeout.
- A timeout or network failure permits one additional attempt.
- An HTTP 5xx response permits one additional attempt.
- No check makes more than two attempts total.
- Invalid response content and other non-success HTTP responses are not retried.
- Any final failure is returned as readable tool-result text. It must not escape the tool as an exception.

## Testability

The fetch implementation is injectable. Tests use a fake fetch to cover success, provider selection/default, timeout and retry limit, retryable network/server failures, malformed response, and readable final error results without making network requests.
