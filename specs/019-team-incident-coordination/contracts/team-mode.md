# Team Mode and Chat Contract

## Route selection

The team mode is the `team` production-graph route on the existing `POST /chat` endpoint. It is not a separate `/team` endpoint.

- Without `strategy`, the existing outer router may select `team`.
- With `"strategy": "team"`, the existing explicit strategy override selects the team graph without an outer routing call.
- The `reflact` option is rejected for `team`: reflection reruns a strategy and would violate the request-wide dispatch limit.
- The HTTP request and the common response fields remain those of the existing chat contract.
- `team` is a valid persisted request route and a valid `route` trace-event value.

## Supervisor decision

The supervisor returns a structured object with exactly `next` and `brief`:

```json
{
  "next": "analista",
  "brief": "Verifique quais alertas e incidentes abertos correspondem ao serviço afetado."
}
```

`next` is one of `analista`, `planejador`, `executor`, or `done`. `brief` is a non-empty task brief for a role or the final answer when `next` is `done`. The service validates the closed destination enum; invalid or missing values fail the request and do not trigger a fallback role.

## Role capabilities

| Role | Reads | Tools | Output |
|---|---|---|---|
| `analista` | Request and relevant board data | Read-only alert, incident-list, runbook, and provider-status tools | Factual observations only; no proposals or operations |
| `planejador` | Request, observations, and board data | None | Ordered proposed next steps |
| `executor` | Request, plan, and relevant observations | Incident-scoped tools only; mutations pass through the existing approval service | Validated operation result, pending action, denial, or failure |
| `supervisor` | Request and board summaries | None | Structured `next` and `brief` decision |

Prompt instructions are not permission boundaries: the worker’s actual tool list enforces each capability. The executor does not have a direct mutation path that bypasses pending-action approval.

## Handoff trace event

Each supervisor decision adds one event to the shared trace:

```json
{
  "sequence": 3,
  "node": "supervisor",
  "type": "handoff",
  "from": "supervisor",
  "to": "analista",
  "brief": "Verifique quais alertas e incidentes abertos correspondem ao serviço afetado."
}
```

- `sequence` is contiguous with the other trace events.
- `from` is `supervisor`; `to` is `analista`, `planejador`, `executor`, or `done`.
- `brief` is the safe task summary passed to a role, or the final summary for `done`.
- A `done` decision terminates the graph; it is recorded as a handoff event but does not consume a role dispatch.
- Trace data must not include private model reasoning, credentials, or the complete team board.

## Dispatch limit

At most eight supervisor dispatches to roles are allowed for one request. The graph counts only these dispatches, not model calls or internal graph nodes. If another role is required after the eighth dispatch, execution stops with an explicitly incomplete answer and no ninth handoff.

## Chat responses and failures

The existing `POST /chat` request schema continues to carry `message`, `userId`, optional `strategy`, optional `reflact`, and optional `conversationId`.

- `200 OK`: validated chat result with `answer`, `trace`, `metrics`, `requestId`, and `conversationId`.
- `202 Accepted`: existing accepted chat response with the result and `pendingActions` when an executor mutation awaits a decision.
- When a mutation is pending, coordination stops with a deterministic pending response; no further supervisor summary can claim the operation succeeded.
- `400 Bad Request`: invalid chat input.
- `422 Unprocessable Entity`: an unsupported explicit strategy.
- `503 Service Unavailable`: configured model unavailable.
- `500 Internal Server Error`: invalid supervisor/role result, execution failure, or unexpected team error.
- `504 Gateway Timeout`: existing chat execution deadline reached.

An unconfirmed incident operation must not be reported as completed. Error responses do not contain a success-shaped answer.

## Trace viewing and persistence

- The existing `/requests/:id` result includes the ordered `handoff` events for the queried request only.
- The shared trace schema validates the event in the server, persisted store, and web client.
- “Ver raciocínio” renders the destination role and task brief as a distinct trace event.
- The SQLite schema accepts the new route and event type only after a compatibility migration; existing request and event rows remain readable.
