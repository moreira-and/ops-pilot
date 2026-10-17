# Data Model: Núcleo de raciocínio do OpsPilot

The versioned `src/scripts/demo-data.json` file provides the initial services and alerts. The default operational store loads that fixture into memory; incidents and other mutations last for the current process only. Strategy execution, trace events, and plans are also run-scoped and are not persisted.

## Service

Represents an operated application or component.

| Field | Type / rule | Required |
|-------|-------------|----------|
| `id` | Stable string identifier; primary key | Yes |
| `name` | Non-empty display name | Yes |

**Relationships**: One service has many alerts and incidents. A referenced service must exist before an alert or incident can be created. Service identifiers and names are validated when the JSON fixture is loaded.

## Alert

Represents an operational signal associated with a service.

| Field | Type / rule | Required |
|-------|-------------|----------|
| `id` | Stable string identifier; primary key | Yes |
| `serviceId` | Foreign key to Service | Yes |
| `title` | Non-empty alert title | Yes |
| `status` | `firing` or `resolved` | Yes |
| `severity` | `critical`, `high`, `medium`, or `low` | Yes |
| `createdAt` | Creation timestamp | Yes |
| `updatedAt` | Last update timestamp | Yes |

**Seed invariant**: The JSON demonstration fixture contains six services and seven alerts, including a `catalog` service with a `firing` alert, four `firing` and three `resolved` in total. Stable IDs make the fixture repeatable; no external database is read or modified.

## Incident

Represents an operator-created response record.

| Field | Type / rule | Required |
|-------|-------------|----------|
| `id` | Generated unique identifier; primary key | Yes |
| `title` | Non-empty title | Yes |
| `serviceId` | Foreign key to Service | Yes |
| `severity` | `critical`, `high`, `medium`, or `low` | Yes |
| `status` | `open` or `resolved`; new incidents start `open` | Yes |
| `createdAt` | Creation timestamp | Yes |
| `updatedAt` | Last update timestamp | Yes |
| `resolvedAt` | Timestamp of successful resolution; null until resolved | No |

**State transitions**: `open` -> `resolved`. Resolving an unknown identifier is an explicit domain error. Re-resolving an already resolved incident returns an explicit domain outcome and must not claim a new state change.

## Reasoning Run (ephemeral)

Represents one strategy invocation; no database persistence is required.

| Field | Type / rule | Required |
|-------|-------------|----------|
| `strategy` | Stable strategy name (`react` or `plan-and-execute`) | Yes |
| `input` | Non-empty user request | Yes |
| `answer` | Final user-facing response or explicit bounded/failure summary | Yes |
| `trace` | Ordered list of typed trace events | Yes |
| `metrics.llmCalls` | Non-negative integer counting model invocations | Yes |
| `metrics.latencyMs` | Non-negative elapsed time in milliseconds | Yes |

Trace event kinds are `thought`, `action`, `observation`, `plan`, `critique`, and `answer`. An action includes the tool name, tool-call ID when provided, and validated/redacted arguments. A thought event contains only explicit user-visible rationale, not hidden reasoning.

## Plan Step (ephemeral)

| Field | Type / rule | Required |
|-------|-------------|----------|
| `step` | Non-empty executable instruction returned by the planner | Yes |
| `result` | Executor observation paired with the completed step in `done` | After execution |

The initial plan and all replans together contain no more than eight completed and pending steps. The planner emits short textual steps; the executor resolves each step to a validated tool and arguments. Execution processes no more than one step per strategy iteration. The replanner may remove or revise pending steps after observing the result and must preserve completed step/result pairs to avoid repeating completed operations.
