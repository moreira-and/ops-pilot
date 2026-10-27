# Research: Grafo unificado de produção

## Decision 1: Compose the flow with the existing LangGraph `StateGraph`

- **Decision**: Implement one compiled graph with explicit context, router, strategy, and response nodes. Use conditional edges from the router to exactly one of the three named strategy nodes. Keep the state-definition approach consistent with the existing graphs in this repository.
- **Rationale**: The project already uses `StateGraph`, `Annotation.Root`, and conditional edges for Plan-and-Execute. LangGraph documents nodes as asynchronous functions returning partial state and conditional edges as a router-to-node mapping, which suits composition of the existing strategies without rewriting them.
- **Alternatives considered**: Create a separate `switch` in the HTTP controller, which would duplicate orchestration and omit graph-level trace ownership; migrate existing graphs to `StateSchema`, which is unrelated to this feature and not needed for conditional routing.
- **Sources**: [LangGraph.js graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api); [StateGraph `addConditionalEdges` reference](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph/addConditionalEdges).

## Decision 2: Use structured output for automatic route decisions

- **Decision**: Ask the existing model factory for a Zod-validated structured `{ route, reason }` result through `withStructuredOutput`. Restrict `route` to `react`, `plan-and-execute`, or `reflect:react`; reject malformed results instead of silently choosing a fallback.
- **Rationale**: Structured output makes route names a closed, testable value set and preserves a concise decision reason for the public trace. This matches the project’s existing use of `withStructuredOutput` for model tasks.
- **Alternatives considered**: Parse free-form model text, which permits ambiguous or invalid route names; choose a default after malformed model output, which would disguise a routing failure as a successful decision; add a routing dependency, which is unnecessary.
- **Sources**: [LangChain.js model structured output](https://docs.langchain.com/oss/javascript/langchain/models); existing project usage in `src/agents/plan-and-execute.ts` and `src/services/learning-service.ts`.

## Decision 3: Keep strategy implementations as graph-node delegates

- **Decision**: Wrap the existing `react`, `plan-and-execute`, and `reflect:react` strategy invocations as named graph nodes. Adapt their results into graph state and normalize their traces at the graph boundary rather than reimplementing their reasoning.
- **Rationale**: LangGraph nodes may be asynchronous state-to-partial-state functions, so existing strategy calls can be delegated from a small adapter. This preserves current strategy behavior, tool boundaries, and deterministic dependency injection.
- **Alternatives considered**: Rebuild each strategy as a node-by-node subgraph, which substantially expands scope and risks changing established behavior; execute strategy selection entirely outside the graph, which loses unified orchestration.
- **Sources**: [LangGraph.js graph API, nodes and conditional edges](https://docs.langchain.com/oss/javascript/langgraph/graph-api).

## Decision 4: Make the public chat trace the stable observability boundary

- **Decision**: Emit a route event with selected route, reason, and selection source. Ensure every event returned by `/chat` has a `node`; tag delegated strategy events at the owning graph strategy node, and tag chat-service-added context summary events with the context node. Re-sequence the combined trace in occurrence order.
- **Rationale**: Existing strategies already return ordered typed events, while the feature adds graph-level routing and service-generated events. Normalization at these composition boundaries gives clients a uniform contract without exposing provider reasoning or full private context.
- **Alternatives considered**: Publish raw LangGraph updates, which couples the HTTP API to internal update formats; include complete prompt/context text in a trace event, which may expose conversation or memory content; leave independent trace sequences unnormalized.

## Decision 5: Count router work in the existing result metrics

- **Decision**: Count each automatic router invocation once using the existing model callback counter and add it to the selected strategy's model-call count. Do not invoke the router model when the caller provides a valid override. Measure elapsed latency around the full graph execution.
- **Rationale**: Existing metrics represent actual model invocations and elapsed execution; including routing keeps reported cost consistent with the complete work that produced the answer.
- **Alternatives considered**: Exclude routing from metrics, which understates model usage; infer calls from graph nodes, which is inaccurate when model calls fail or retry; issue an extra model call for explicit selection.
- **Sources**: Existing callback accounting in `src/agents/metrics.ts` and strategy metrics in `src/agents/reasoning.ts`.

## Decision 6: Keep chat context and persistence in the existing chat service

- **Decision**: Continue preparing bounded history, summary, and recalled memories through `createChatService` and `context-builder.ts`; pass the prepared strategy input into the graph. The graph context node marks the start of graph execution but does not copy context contents into the public trace.
- **Rationale**: The current service already owns context preparation and conversation persistence. Reusing it keeps the graph focused on selection and strategy orchestration, avoids duplicate context budgeting, and protects private conversation content.
- **Alternatives considered**: Move memory retrieval, history pruning, and persistence into the graph, which would mix application-service responsibilities into agent orchestration and duplicate existing behavior.
- **Sources**: `src/services/chat-service.ts`; `src/context/context-builder.ts`.

## Technology References

- [LangGraph.js graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api)
- [LangChain.js model structured output](https://docs.langchain.com/oss/javascript/langchain/models)
- [LangGraph.js conditional edge reference](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph/addConditionalEdges)
