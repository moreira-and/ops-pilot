# Data Model: Persistência Operacional

## Service

Represents a service known to OpsPilot.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Required, unique identifier |
| `name` | string | Required, non-empty display name |

Relationships: one service may have many alerts and incidents and may have a runbook.

## Alert

Represents a monitoring signal associated with a service.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Required, unique identifier |
| `serviceId` | string | Required, references a service |
| `title` | string | Required, non-empty |
| `status` | enum | `firing` or `resolved` |
| `severity` | enum | `critical`, `high`, `medium`, or `low` |
| `createdAt` | date/time | Required |
| `updatedAt` | date/time | Required |

`serviceName` is resolved from the related service in the operational record; it is not a second
independent service identity.

## Incident

Represents an operational issue being tracked for a service.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Required, unique identifier |
| `title` | string | Required, non-empty |
| `serviceId` | string | Required, references a service |
| `severity` | enum | `critical`, `high`, `medium`, or `low` |
| `status` | enum | `open` or `resolved` |
| `summary` | string or null | Optional incident summary |
| `resolvedAt` | date/time or null | Null until resolved |
| `createdAt` | date/time | Required |
| `updatedAt` | date/time | Required |

State transition: a new incident is `open` with null `summary` and `resolvedAt`. Resolving it
sets `status` to `resolved`, records `resolvedAt`, and updates `updatedAt`. Re-resolving an already
resolved incident does not change its resolution time.

## Runbook

Represents a service-specific procedure returned for operator reference. The initial scenario
provides one runbook for each of `checkout`, `payments`, and `auth`.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Required, unique identifier |
| `serviceId` | string | Required, references one service; unique per service |
| `title` | string | Required, non-empty procedure title |
| `instructions` | string | Required, non-empty procedure text |

## Referential and domain constraints

- Alerts, incidents, and runbooks reference existing services.
- Persisted values for alert status, incident status, and severity belong to the enums above.
- `tier` is not part of the service entity: it does not exist in the current domain and was
  excluded from the feature scope.
