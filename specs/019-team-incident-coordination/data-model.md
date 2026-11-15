# Data Model: Team Incident Coordination

## TeamExecution

One invocation of the team strategy inside an existing chat request.

| Field | Type | Rule |
|---|---|---|
| `requestId` | UUID | Reuses the chat request ID when available; identifies the trace and approval proposals |
| `input` | string | Non-empty, validated request text |
| `board` | `BoardEntry[]` | Initialized empty for each invocation; not shared across requests |
| `handoffs` | integer | Starts at zero; counts supervisor dispatches to a role; range 0–8 |
| `answer` | string | Final user-facing answer, or explicit incomplete/failure result |
| `trace` | `TraceEvent[]` | Ordered, schema-validated events for this request |

## BoardEntry

Request-local information exchanged between permitted roles. The board is an in-memory graph-state channel, not a persistent entity.

| Field | Type | Rule |
|---|---|---|
| `role` | `analista` \| `planejador` \| `executor` \| `supervisor` | Closed role set identifying the producer |
| `kind` | `observations` \| `plan` \| `operation` | Identifies the kind of content |
| `content` | string | Non-empty summary or validated result; no unvalidated tool arguments |
| `status` | `complete` \| `pending` \| `blocked` \| `failed` | Distinguishes confirmed, awaiting approval, blocked, and failed work |

**Visibility**: The supervisor sees the board; each role receives only the current task brief and the board context required for its task. The analyst can read operational data through read-only tools. The planner receives observations and has no tools. The executor receives the plan and validated observations and has only incident-scoped tools.

## SupervisorDecision

Structured output used by the supervisor for every decision.

| Field | Type | Rule |
|---|---|---|
| `next` | `analista` \| `planejador` \| `executor` \| `done` | Closed enum; `done` terminates the workflow |
| `brief` | string | Trimmed and non-empty; task instruction for a role or the final answer when `next` is `done` |

The schema is validated before dispatch. Invalid output fails explicitly and must not be interpreted as a role name or a successful answer.

## Handoff Trace Event

Extends the existing shared `TraceEvent` union.

| Field | Type | Rule |
|---|---|---|
| `sequence` | integer | Non-negative and contiguous in the final trace |
| `node` | string | `supervisor` |
| `type` | literal | `handoff` |
| `from` | literal | `supervisor` |
| `to` | `analista` \| `planejador` \| `executor` \| `done` | Selected destination; `done` is terminal |
| `brief` | string | Safe, concise task brief passed to the destination role, or final summary when `to` is `done` |

The existing trace viewer and persisted trace contract consume the same validated event. The brief is not a storage channel for hidden reasoning or the full board.

## Existing RequestRecord and TraceEventRecord

The team strategy reuses current request trace persistence.

- `RequestRecord.route` adds `team` to the existing production-route enum.
- `TraceEventRecord.payload` accepts the new `handoff` event through the shared trace schema.
- Each request retains its existing UUID, user identity, status, metrics, and completion behavior.
- Trace events remain ordered by their sequence and foreign-keyed to one request.
- Existing records are preserved during the schema upgrade; route and event type constraints remain closed.

## Existing PendingAction

Incident mutations reuse the current action lifecycle; no new action entity or state machine is introduced.

| Status | Meaning for team execution |
|---|---|
| `pending` | Executor proposed an operation; chat may return HTTP 202 |
| `processing` | Existing decision service is handling an approval |
| `approved` | Operation was authorized; report completion only after a confirmed result |
| `denied` | Operation was rejected; do not retry or report success |
| `failed` | Authorized operation failed; report failure |
| `reconciliation_required` | Outcome is uncertain; do not retry or claim completion |

## Relationships and State Transitions

- One `TeamExecution` corresponds to one existing `RequestRecord`.
- One `TeamExecution` has zero to eight role-dispatch handoff events, optionally followed by one terminal `done` event, and zero or more board entries.
- A supervisor decision creates one handoff event with `from: "supervisor"` and the selected `to`.
- A supervisor decision to `done` records the brief as the answer and does not increment the role-dispatch count.
- If another role is required after eight dispatches, the graph stops with an explicit incomplete result; it never creates a ninth handoff.
- An executor mutation creates or returns an existing pending action. Only the existing decision service can progress an action to execution.

## Validation and Persistence

- Parse team inputs, supervisor decisions, board updates, role outputs, handoff events, and final results with Zod.
- Restrict `next`, `handoff.from`, and `handoff.to` to closed enums.
- Keep board and role state scoped to a single invocation; do not persist board contents.
- Use the existing prepared-statement SQLite store for request and trace persistence.
- Upgrade existing SQLite `CHECK` constraints transactionally to allow route `team` and event type `handoff` while preserving all current rows and constraints.
- Return events ordered by their contiguous trace sequence and reject a trace payload whose event `type` or `node` disagrees with its stored metadata.
