# Research: Persistent Conversations

## Decision 1: Persist conversation identity separately from message records

**Decision**: Use a conversation record keyed by an opaque ID and message records linked to that ID. Each message has a monotonic sequence, a closed role (`user` or `assistant`), content, and a creation time.

**Rationale**: A conversation can exist before its first message, foreign keys prevent orphan messages, and a monotonic sequence gives an unambiguous ordering for retrieving the most recent messages.

**Alternatives considered**:
- Store only a conversation ID on messages: this cannot represent a newly created conversation with no messages and provides no referential constraint for conversation existence.
- Order only by timestamp: timestamps can tie and therefore do not provide deterministic ordering by themselves.

## Decision 2: Read the most recent bounded history with fixed prepared SQL

**Decision**: Query the latest 12 messages for one conversation in descending sequence order with a bound limit, then return that subset in chronological order. Prepare fixed SQL once in the SQLite adapter and bind identifiers and limits.

**Rationale**: The query bounds both the data supplied to the model and the materialized result set, while reversal restores conversational order. Bound values avoid interpolating external input into SQL.

**Alternatives considered**:
- Read the entire transcript and slice in application memory: this loads unnecessary historical data and scales with conversation age.
- Return newest-first: this reverses the context order expected by the strategy.
- Interpolate conversation IDs or limits into SQL: rejected in favor of prepared statements and bound values.

**References**:
- [Node.js SQLite `DatabaseSync` and `Database`](https://nodejs.org/api/sqlite.html)
- [Node.js SQLite prepared statements](https://nodejs.org/api/sqlite.html#databasepreparesql-options)
- [Node.js SQLite `StatementSync.all()`](https://nodejs.org/api/sqlite.html#statementallnamedparameters-anonymousparameters)
- [SQLite `ORDER BY`](https://www.sqlite.org/lang_select.html#orderby)

## Decision 3: Compose recent history at the chat-service boundary

**Decision**: The chat service passes a structured `{ message, history }` input to its chat-strategy boundary, where `history` contains up to 12 chronologically ordered role-preserving records. The HTTP adapter formats those records with explicit `User`/`Assistant` labels and appends the current user message before calling the existing string-based `ReasoningStrategy`. The service records the number of prior messages actually included and the HTTP response exposes it as `metrics.historyMessages`.

**Rationale**: The structured service boundary exposes the same message and history values as the requested chat flow while preserving compatibility with registered strategies, the reflection decorator, and other existing strategy consumers. Keeping the history count at the composition boundary makes the metric describe the actual retrieved context rather than model-call internals.

**Alternatives considered**:
- Persist model-specific agent state or a LangGraph checkpointer: this duplicates the application-owned store and couples conversation persistence to one strategy runtime.
- Change every strategy to accept framework-specific message objects: this expands the public strategy contract and requires separate history handling across agent implementations.
- Flatten the whole transcript without role labels: this makes the source of prior text ambiguous.

**References**:
- [LangChain JS messages](https://docs.langchain.com/oss/javascript/langchain/messages)
- [LangChain JS short-term memory](https://docs.langchain.com/oss/javascript/langchain/short-term-memory)

## Decision 4: Keep deterministic persistence and orchestration tests

**Decision**: Give the SQLite adapter an injectable database path with `:memory:` support, and inject a fake `ConversationStore` and fake reasoning strategy in chat-service and HTTP tests.

**Rationale**: This covers real schema/query behavior without filesystem state and verifies prompt composition, response fields, and errors without model or network calls.

**Alternatives considered**:
- Use only a fake store: it does not verify SQLite constraints, query ordering, or in-memory initialization.
- Use only a real store in HTTP tests: it couples API tests to database setup and makes specific persistence-failure scenarios harder to isolate.

**References**:
- [Node.js SQLite database constructor and in-memory databases](https://nodejs.org/api/sqlite.html#new-databasepath-options)
