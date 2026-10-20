# Data Model: Provider Status Check

This feature is read-only and does not add persisted entities.

## Provider

Represents the external service whose public status is checked.

| Field | Type | Rules |
|---|---|---|
| provider | enum | `github` or `cloudflare`; defaults to `github` when omitted |

Each supported value maps internally to its fixed public status endpoint. Callers cannot supply or override an endpoint.

## Status Observation

Represents the useful summary extracted from a status-page response.

| Field | Type | Rules |
|---|---|---|
| indicator | string | Required in `status`; must be a string |
| description | string | Required in `status`; must be a string |

The accepted response contains an object at `status` with both fields. Unrecognized additional fields do not need to be returned. A successful tool result combines the indicator and description on one line.

## Failure Result

No persistent entity is created. A final timeout, network failure, server error, non-retryable HTTP failure, or invalid response is represented as readable text returned by the tool. Failure results are not thrown beyond the tool boundary.
