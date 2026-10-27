# Data Model: Grafo unificado de produção

The graph, route decision, trace, and result are ephemeral to one `/chat` request. No persistence schema or migration is introduced. Existing conversation, memory, and operational data remain owned by their current services and stores.

## Production Graph Run

Represents one request passing through the production graph.

| Field | Type / rule | Required |
|-------|-------------|----------|
| `input` | Non-empty, context-enriched user request prepared by the existing chat flow | Yes |
| `strategyOverride` | `react`, `plan-and-execute`, or `reflect:react`; absent means automatic routing | No |
| `route` | One of the three supported strategy identifiers | After routing |
| `routeReason` | Non-empty explanation associated with the selected route | After routing |
| `routeSource` | `router` for an automatic choice or `override` for a caller choice | After routing |
| `result` | Selected strategy answer, trace, and strategy metrics | After strategy execution |
| `trace` | Combined, ordered graph and strategy events with node identifiers | Yes |
| `metrics.llmCalls` | Non-negative integer for router plus strategy model invocations | On successful result |
| `metrics.latencyMs` | Non-negative elapsed time for graph routing and strategy execution | On successful result |

**Validation rules**:

- The override, when supplied, must match a registered route exactly; unknown routes fail before strategy execution.
- Automatic router output is parsed against the same closed route set and requires a non-empty reason.
- Only one strategy node executes for each request.
- An override does not invoke the router model.

## Route Decision

| Field | Type / rule | Required |
|-------|-------------|----------|
| `route` | `react`, `plan-and-execute`, or `reflect:react` | Yes |
| `reason` | Non-empty user-safe explanation; no hidden chain-of-thought | Yes |
| `source` | `router` or `override` | Yes |

**Automatic routing table**:

| Request intent | Route |
|----------------|-------|
| Direct, bounded request answerable in a short reasoning/tool cycle | `react` |
| Request requiring multiple ordered operational steps or coordinated tool actions | `plan-and-execute` |
| Request that explicitly asks to verify or ground a potentially consequential answer in collected observations | `reflect:react` |
| Ambiguous request without indicators for the other routes | `react` |

## Trace Event

Represents one observable event in the chat execution.

| Field | Type / rule | Required |
|-------|-------------|----------|
| `sequence` | Non-negative integer; contiguous and ordered in the combined trace | Yes |
| `type` | Existing event type, or `route` for the graph decision | Yes |
| `node` | Stable node identifier that produced or owns the event | Yes |
| `route` | One of the three supported strategy identifiers; route events only | Route event |
| `reason` | User-safe decision explanation; route events only | Route event |
| `source` | `router` or `override`; route events only | Route event |
| Existing type-specific fields | Existing fields for thought, action, observation, plan, critique, summarize, or answer events | As applicable |

**Node ownership**:

- `context`: generic context-prepared observation and context-summary event appended by the chat service.
- `router`: automatic route-decision event.
- `strategy-react`, `strategy-plan-and-execute`, or `strategy-reflect-react`: delegated strategy events.
- `response`: final answer event when the graph response node creates or normalizes it.
- The override route event is owned by the graph routing boundary and records `source: override`.

The trace records that context was prepared using a generic observation, but does not include full conversation, memory, or prompt contents. An existing strategy answer event is normalized to the `response` node rather than duplicated.

## Chat Result

The successful `/chat` response retains the existing answer, trace, metrics, and conversation metadata. Every trace event includes `node`, and metrics include the router invocation when routing was automatic. Error responses remain separate and contain no success-shaped result.
