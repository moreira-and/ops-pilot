# Research: Núcleo de raciocínio do OpsPilot

## Decision 1: Follow the supplied LangGraph ReAct example and inject model dependencies

- **Decision**: Build ReAct with the supplied prebuilt LangGraph `createReactAgent` API, keep Plan-and-Execute as an explicit `StateGraph`, and construct `ChatOpenAI` with OpenRouter's OpenAI-compatible base URL in the shared model factory. Inject model, agent, tool, and store dependencies for deterministic tests.
- **Rationale**: This follows the implementation example the user explicitly supplied and keeps the graph-backed ReAct agent, while the project's installed `@langchain/openai` package already supports the compatible endpoint. The installed LangGraph declarations mark `createReactAgent` deprecated in favor of `langchain`; preserve the supplied API for this implementation and track that deprecation for a later migration. Explicit Plan-and-Execute nodes make step limits and replanning observable; injection keeps unit tests offline.
- **Alternatives considered**: Migrate immediately to LangChain's maintained `createAgent` API, which would diverge from the supplied code example; hand-roll ReAct loops; add the dedicated OpenRouter package instead of using the already-installed OpenAI-compatible integration; construct models in each strategy; use an opaque autonomous Plan-and-Execute chain that makes step limits and trace capture less direct.

## Decision 2: Capture execution events without exposing hidden reasoning

- **Decision**: Emit trace events at model and tool boundaries; include tool-call ID, validated/redacted arguments, result or error, and event order. Normalize graph updates into the six defined event kinds. Count model calls through invocation callbacks/wrapping, deduplicated by model run ID, and measure wall-clock latency with a monotonic timer. Include retry attempts and failed invocations in the call count. A `thought` event is permitted only for explicit rationale text emitted as ordinary model output; hidden chain-of-thought is not requested, persisted, or exposed.
- **Rationale**: Tool and graph events are observable and reproducible, whereas hidden model reasoning is neither a stable contract nor appropriate to expose. Invocation-level accounting counts failed requests as calls and avoids confusing token usage with call count.
- **Alternatives considered**: Estimating call count from token usage metadata is not equivalent; parsing natural-language text for tool actions loses structure; returning provider-internal reasoning can leak sensitive or unavailable data; forwarding raw unredacted tool arguments can expose data in traces.

## Decision 3: Use a JSON demonstration fixture and in-memory default store

- **Decision**: Load the stable service and alert records from `src/scripts/demo-data.json` into the default `InMemoryOperationalStore`. Tool-created incidents and other mutations remain available to later tool calls in the current process and are discarded on restart. Keep the Sequelize/MySQL adapter and migrations separate; the default tools and seed command do not connect to MySQL.
- **Rationale**: The user requested the seed JSON as the temporary source of truth and in-memory execution for tests. This keeps model tool calls grounded in known services and alerts while avoiding external database configuration and allowing controlled tests.
- **Alternatives considered**: Requiring MySQL for each strategy run conflicts with the temporary in-memory requirement; rewriting a mutable JSON database file would make test runs stateful across invocations; removing the existing Sequelize adapter would be unrelated and unnecessarily destructive.

## Decision 4: Treat strategy limits as bounded decision cycles and report actual model-call counts

- **Decision**: Validate `maxIterations` as a positive integer. Each reasoning/planning cycle consumes one iteration; each Plan-and-Execute cycle executes no more than one step. Enforce an eight-step total maximum across execution and replanning, and return a bounded result when execution reaches its cycle limit. Record actual model invocations separately from iterations.
- **Rationale**: Planner, executor, and replanner may each make model calls, so iteration count cannot be presented as LLM-call count. Explicit cycle semantics make the user's iteration bound testable while the eight-step total protects execution across replans.
- **Alternatives considered**: Treating each tool as an iteration makes behavior depend on parallel tool batches; conflating iterations and model calls gives misleading metrics; relying solely on graph recursion limits risks off-by-one semantics and does not represent the feature's domain limit.

## Decision 5: Configure OpenRouter through the existing OpenAI-compatible chat model

- **Decision**: Construct `ChatOpenAI` in the one model factory with `OPENROUTER_API_KEY`, `OPENROUTES_MODEL`, `https://openrouter.ai/api/v1`, and temperature zero. Disable hidden retries so every model invocation is counted once and fails explicitly.
- **Rationale**: `@langchain/openai` is already a declared project dependency and the supplied sample uses OpenRouter's compatible endpoint. Validate model selection/configuration explicitly and ensure the selected OpenRouter model supports tool calling and structured output.
- **Alternatives considered**: Add the dedicated LangChain OpenRouter integration, which requires a new dependency and diverges from the supplied sample.

## Decision 6: Keep the arena a sequential CLI over shared process memory

- **Decision**: Parse and validate `--input`, `--strategies`, and `--max-iterations` at the CLI boundary; default to ReAct and a positive finite iteration limit. Execute selected strategies sequentially in requested order against a shared in-memory store for the process lifetime.
- **Rationale**: The arena is an operator/developer-facing CLI already represented in package scripts. Sequential runs avoid racing shared writes and make the execution order explicit. The JSON fixture is reloaded for each new process; mutations made during one arena invocation can affect later strategies in that invocation.
- **Alternatives considered**: Parallel runs can race on shared records; snapshot/rollback semantics would hide or discard requested operational actions and are outside the stated requirement; an interactive prompt is unnecessary for a minimum arena.

## Decision 7: Keep deterministic tests independent of MySQL and OpenRouter

- **Decision**: Test domain operations through an injected in-memory repository/store and test model-dependent graph behavior with controlled model doubles; test formatting and CLI parsing as pure functions.
- **Rationale**: The spec explicitly requires deterministic store/trace tests without network access. Dependency injection avoids hidden network or database requirements in the normal unit-test command.
- **Alternatives considered**: Requiring local MySQL/OpenRouter credentials for unit tests makes validation non-deterministic and unsuitable for ordinary CI; mocking global SDK internals is less reliable than injecting the application boundary.

## Technology references

- LangChain JavaScript agents: `https://docs.langchain.com/oss/javascript/langchain/agents`
- LangGraph JavaScript graph API: `https://docs.langchain.com/oss/javascript/langgraph/graph-api`
- LangGraph streaming: `https://docs.langchain.com/oss/javascript/langgraph/streaming`
- LangChain OpenRouter integration: `https://docs.langchain.com/oss/javascript/integrations/chat/openrouter`
- Sequelize v6 MySQL dialect, pool, transactions, and migrations: `https://sequelize.org/docs/v6/other-topics/dialect-specific-things/`, `https://sequelize.org/docs/v6/other-topics/connection-pool/`, `https://sequelize.org/docs/v6/other-topics/transactions/`, `https://sequelize.org/docs/v6/other-topics/migrations/`
