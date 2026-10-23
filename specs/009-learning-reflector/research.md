# Research: Learning Reflector

## Structured extraction

- **Decision**: Use the existing configured chat model's `withStructuredOutput` with a Zod-validated result containing `hasLearning` and `fact`. Invoke it with only the current request's latest user message and an extraction instruction that admits only explicitly stated durable facts.
- **Rationale**: The repository already uses `withStructuredOutput` for reflection verdicts in `src/agents/reflection.ts`, and `ChatOpenAI` is already the configured model. Reusing those patterns avoids a new provider or extraction protocol. Passing only the current message makes it impossible for prior assistant answers or older turns to become source facts.
- **Alternatives considered**: Extracting from the composed chat prompt or conversation history was rejected because it can misattribute assistant content or learn old/prompt-only details. Parsing free-form model text was rejected because invalid output could accidentally become a persisted fact.

## Asynchronous learning lifecycle

- **Decision**: Start extraction after strategy success and successful conversation persistence, without awaiting it in the HTTP response path; attach an explicit rejection handler that logs a sanitized error. Call `MemoryStore.remember` only when validated output signals an eligible, non-empty fact.
- **Rationale**: This preserves response latency and prevents a background failure from replacing an answer already delivered. The background task remains observable through explicit error logging and is testable with deferred promises.
- **Alternatives considered**: Awaiting extraction before responding violates the stated latency requirement. Silently discarding failures violates the specification. A durable queue was rejected for this scope because persisting raw source messages could itself retain secrets and requires lifecycle/retry policy beyond the requested feature.
- **Operational limitation**: The in-process task is best effort and can be lost if the process exits before it completes. The HTTP response does not claim that learning has completed; successful persistence can be verified in a later memory recall after the background task finishes.

## Secret handling

- **Decision**: Instruct the extractor never to return credentials and fail closed when the source or candidate triggers the secret detector; do not log source messages, candidate facts, or secret values. Tests cover common credential markers and token/key formats.
- **Rationale**: Model instructions alone are not a sufficient security boundary. A deterministic rejection layer prevents common recognizable secret patterns from entering persistent memory or logs.
- **Alternatives considered**: Relying only on the model was rejected as unsafe. Redacting just the detected substring was rejected because surrounding text can still expose or reconstruct the credential; the safer default is to skip learning from that message/candidate.
- **Limitation**: No finite pattern detector can identify every arbitrary secret value. This defense is conservative and defense-in-depth, not a guarantee that any unmarked, opaque credential will be recognized.

## Trusted identity for agent tools

- **Decision**: Supply `userId` through LangGraph's per-invocation runtime `context` and read it inside `forget_preference`; do not include an owner field in the model-visible tool schema or inject it only into the prompt.
- **Rationale**: The installed LangGraph prebuilt agent supports `contextSchema`, and LangChain tool handlers receive `ToolRuntime.context`. This is an out-of-band, typed path for trusted request metadata; model-generated tool arguments cannot select another user's memory scope.
- **Alternatives considered**: A model-visible `userId` argument was rejected because the model could supply a different owner. Parsing user identity from prompt text was rejected because it is untrusted text and can be ambiguous. A global tool bound to one user was rejected because agent strategies are shared across concurrent HTTP requests.

## Forget matching and ambiguity

- **Decision**: Accept a natural-language description of the preference, retrieve user-scoped top-3 semantic candidates through `MemoryStore.recall`, and delete at most one candidate only when the best score meets a conservative forget-confidence threshold and is sufficiently separated from the next candidate. Return `ambiguous` without deleting when multiple candidates are plausible; return `not_found` if no candidate qualifies. Thresholds and margin are named constants and tested.
- **Rationale**: Existing recall already enforces ownership, ranking, and the minimum relevance threshold; using it avoids a new all-user query path. Conservative matching makes mistaken deletion less likely and gives the agent a clear reason to ask for clarification.
- **Alternatives considered**: Deleting the top result unconditionally was rejected because a weak or ambiguous match could erase the wrong preference. Allowing the model to provide a memory ID was rejected because users do not see internal identifiers and the model could guess one.
- **Design value**: Initial thresholds use a minimum score of `0.75` and a lead of `0.10` over any second candidate above the existing recall floor (`0.30`). A single qualifying candidate may be removed; two or more plausible candidates require clarification.

## Persistence and test approach

- **Decision**: Reuse `MemoryStore` and `SqliteMemoryStore`; add no table or migration. Inject an extractor and memory operations in unit/service tests, and use an in-memory SQLite-backed store for deletion scope tests.
- **Rationale**: The existing memory component already owns embedding, deduplication, user isolation, and forgetting. Reusing it preserves those invariants and keeps tests independent of network/model availability.
- **Alternatives considered**: A separate learning-memory repository was rejected because it would duplicate persistence and isolation behavior. Requiring a live provider for ordinary tests was rejected as nondeterministic and unnecessary.
