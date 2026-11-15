# Research: Team Incident Coordination

## Decisions

### Use a custom request-scoped LangGraph workflow

**Decision**: Implement a nested `StateGraph` in `src/team/` with explicit supervisor, analyst, planner, executor, and final-answer transitions. Invoke it as the `team` `ReasoningStrategy` from the existing production graph.

**Rationale**: The repository already uses compiled `StateGraph` workflows in `src/agents/production-graph.ts` and `src/agents/plan-and-execute.ts`. LangGraph’s JavaScript Graph API describes state as shared channels updated by nodes and conditional edges, which fits a request-local blackboard. A custom workflow gives the application explicit control over tool permissions and the maximum handoff count.

**Alternatives considered**:

- **A single tool-using supervisor agent**: simpler, but role-specific tool restrictions and an exact, testable handoff ceiling are less explicit.
- **The `langgraph-supervisor` package**: not needed; the project already depends on `@langchain/langgraph`, and LangChain’s current documentation recommends using the subagent pattern or custom workflow rather than adding the separately maintained supervisor package.
- **A separate `/team` HTTP endpoint**: not selected. The existing `/chat` boundary accepts an optional strategy and the production graph already owns route selection; `team` is treated as a graph route as requested.

### Keep the board request-local and uncheckpointed

**Decision**: Initialize a new board for every strategy invocation and do not use a checkpointer or `thread_id`.

**Rationale**: The specification requires isolation between independent requests and does not request durable or cross-request team state. LangGraph documentation distinguishes per-invocation state from checkpointer-backed persistence; not adding a checkpointer avoids accidental cross-request context retention.

**Alternatives considered**:

- **Persist team state with a checkpointer**: enables resume, but adds retention, identity, authorization, and cleanup questions outside this feature’s scope.
- **Store the board in SQLite**: unnecessary for the response trace and would expose more operational context than the feature requires.

### Enforce role permissions through separate tool lists

**Decision**: Construct the analyst and executor with separate, least-privilege tool lists; invoke the planner without tools. Build executor mutation tools only with the existing pending-action service.

**Rationale**: LangChain’s multi-agent documentation describes role-specific tools as the capability boundary. Existing `createOperationalTools` has a direct-operation path when no `PendingActionService` is supplied, so the team strategy must not register an executor mutation path without that service. The pending-action service already records proposals and waits for an explicit decision before executing them.

**Alternatives considered**:

- **Share the full operational tool registry among all roles**: rejected because the analyst/planner would have write capability and the executor could use unrelated operational tools.
- **Rely on role prompts alone**: rejected because prompts do not enforce tool access.

### Validate supervisor routing and enforce the eight-handoff limit in application state

**Decision**: Validate `next` against a closed role/final enum and count role dispatches in the team graph state. Stop before a ninth dispatch and return a clear incomplete result. Configure LangGraph’s recursion limit as a secondary failsafe.

**Rationale**: Model-selected routes are untrusted input. The enum and server-side count make the feature limit deterministic. LangGraph documents recursion-limit errors as a guard for graphs that do not reach a stop condition; it is not the product-level definition of eight handoffs.

**Alternatives considered**:

- **Use only `recursionLimit`**: rejected because graph super-steps are not the same as user-defined handoffs and can change when nodes are added.
- **Allow model-selected arbitrary node names**: rejected because it can route to unauthorized nodes or fail with an unhandled lookup.

### Extend the existing trace contract and SQLite constraints

**Decision**: Add a typed `handoff` event to the shared trace schema, render it in the existing viewer, and expand the closed route/event constraints in the SQLite request-trace store with a transactional compatibility migration.

**Rationale**: The existing `/chat` response, trace retrieval, and War Room viewer already share `TraceEvent`. The request and trace tables enforce closed values, and `CREATE TABLE IF NOT EXISTS` does not update existing constraints. A compatible rebuild is required so both new and pre-existing database files can persist and read the new route/event.

**Alternatives considered**:

- **Represent handoffs as existing `route`, `plan`, or `observation` events**: rejected because clients and persisted traces would not receive the requested `handoff` type.
- **Replace the SQLite database or discard old trace data**: rejected because it violates data preservation and the embedded-persistence constitution.

## Repository Findings

- `src/agents/production-graph.ts` owns the current route enum, structured outer router, strategy dispatch, and final trace normalization.
- `src/agents/index.ts` creates operational tools; `src/index.ts` supplies the pending-action and operational services in production wiring.
- `src/agents/tools.ts` uses approval proposals only when a pending-action service is provided; without it, incident mutation tools execute directly.
- `src/services/pending-action-service.ts` is the existing approval boundary. Its pending status is returned by `/chat` as HTTP `202`.
- `src/agents/reasoning.ts`, `src/services/request-trace-store.ts`, and `web/src/trace-view-model.ts` validate the shared trace format.
- `src/store/sqlite-request-trace-store.ts` creates `requests.route` and `trace_eventos.type` with closed SQLite `CHECK` constraints. Its existing schema setup includes a small inline compatibility change for a request column but no general versioned SQLite migration mechanism.
- `web/src/components/TraceViewer.tsx` renders trace variants through an exhaustive type switch; `handoff` must be handled there.

## External References

- [LangGraph JavaScript Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md) — shared state, nodes, reducers, conditional routing, graph limits, and re-execution behavior.
- [LangChain JavaScript custom workflow](https://docs.langchain.com/oss/javascript/langchain/multi-agent/custom-workflow.md) — custom orchestration combining model calls, deterministic nodes, and tool-using agents.
- [LangChain JavaScript structured output](https://docs.langchain.com/oss/javascript/langchain/structured-output.md) — Zod schemas and validated structured responses; the project’s direct `withStructuredOutput(schema)` model usage is already present in its agent code.
- [LangGraph JavaScript recursion limit](https://docs.langchain.com/oss/javascript/langgraph/errors/GRAPH_RECURSION_LIMIT.md) — recursion limit is a runtime guard for a graph that fails to reach a stop condition.
- [LangChain multi-agent subagents](https://docs.langchain.com/oss/python/langchain/multi-agent/subagents.md) — conceptual role-specific subagent context and tool boundaries; language-specific API examples are not used in the TypeScript design.

## Security and Reliability Notes

- Validate the supervisor’s selected destination before graph routing; do not treat model output as an authorization decision.
- Prompts do not replace tool restrictions. Planner tool absence and analyst/executor allowlists are enforced by construction.
- Incident mutations go through the existing pending-action flow. Do not create a team-only direct write path or treat a pending proposal as a completed operation.
- Keep the trace limited to safe task briefs, role names, and validated tool observations. Do not emit private model reasoning or the full board.
- A graph node may be retried or rerun under future checkpointing; this design adds no checkpointing and relies on the existing pending-action service for write gating.
