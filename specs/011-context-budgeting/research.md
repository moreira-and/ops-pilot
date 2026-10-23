# Research: Context Budgeting

## Decisions

### Section-budget configuration

- **Decision**: Interpret `CONTEXT_BUDGET` as a JSON object with optional `summary`, `history`, and `memories` non-negative integer properties, for example `{"summary":200,"history":1200,"memories":300}`. Merge supplied values over defaults; reject malformed JSON, negative/fractional values, and unknown keys with a dedicated configuration error.
- **Rationale**: JSON clearly represents named independent section ceilings, supports partial overrides, and is straightforward to validate with the project's existing Zod dependency. Zero is useful for deterministic tests and intentionally disabling a section.
- **Alternatives considered**: A comma-separated positional value is harder to identify and validate; separate environment variables would not meet the requested single `CONTEXT_BUDGET` setting.

### Token counting

- **Decision**: Use `js-tiktoken` with the canonical `cl100k_base` encoding for all section counts, and declare it directly in the package manifest rather than relying on its current transitive presence through LangChain packages.
- **Rationale**: The project currently has no token-counting abstraction, while the installed dependency tree already includes `js-tiktoken`. A single explicit encoding makes budgets reproducible regardless of the configured OpenRouter model. Counting covers the complete rendered section, including its heading and separators, rather than only the unformatted source values.
- **Alternatives considered**: Character or word estimates do not reliably measure token ceilings; model-specific encoding lookup may not recognize arbitrary OpenRouter model identifiers and would make behavior vary by deployment.
- **Verification**: The upstream API exports `getEncoding("cl100k_base")` and supports `encode`/`decode`, which can implement prefix truncation. A decoded prefix should be re-encoded and checked against the ceiling to protect against UTF-8 replacement characters at a token boundary. Sources: [encoding selection](https://github.com/dqbd/tiktoken/blob/main/js/src/index.ts), [encode/decode implementation](https://github.com/dqbd/tiktoken/blob/main/js/src/core.ts), [usage example](https://github.com/dqbd/tiktoken/blob/main/js/README.md).

### Reduction and tie-breaking

- **Decision**: For summary text, retain the longest leading token sequence that fits after accounting for the rendered heading. For history, discard oldest whole messages until the rendered section fits. For memories, discard lowest-score whole items until the rendered section fits, then retain the original relative order of the remaining items. Equal scores use stable input order for removal.
- **Rationale**: This preserves the newest conversation, the highest-scoring memories, and deterministic ordering, while respecting the requirement not to leave partial messages or memory facts.
- **Alternatives considered**: Truncating arbitrary message or memory text would produce partial context records and make removal order less predictable. Sorting all remaining memories by score would unnecessarily change their existing display order.

### Prompt integration

- **Decision**: Implement the shared pure builder at `src/context/context-builder.ts` and call it from the current chat input composition path used by `/chat`. Keep the current user message as a complete, unchanged input value and leave the strategy-specific system prompts outside section reduction.
- **Rationale**: `createApp` passes the selected strategy a composed input through `composeStrategyInput`; the same seam serves ReAct, Plan-and-Execute, and reflection-decorated strategies. `composeStrategyInput` currently combines the summary, recalled memories, recent history, and latest message. The strategy system prompts are separately defined and are not part of those bounded sections.
- **Alternatives considered**: Implementing separate trimming logic per strategy duplicates behavior and risks inconsistent results. Moving the logic into each model invocation would require different integrations for ReAct and the planner/executor/replanner stages.

### Errors, persistence, and external interfaces

- **Decision**: Invalid `CONTEXT_BUDGET` values raise a typed configuration error and must not silently fall back to default limits. The builder performs no I/O and does not mutate or persist source context. Do not add a contract artifact because the public `/chat` request and response shapes do not change.
- **Rationale**: Explicit configuration failures prevent a typo from silently weakening limits. Keeping source data unchanged preserves chat-history fidelity and the existing response contract.
- **Alternatives considered**: Silent defaults on malformed input mask operator mistakes; persisting truncated prompt data would irreversibly lose conversation content.

## Research Notes

- The current chat context composition is in `src/services/chat-service.ts`, in `composeStrategyInput`; HTTP dispatch in `src/http/server.ts` invokes the selected registered strategy with that composition.
- `src/agents/index.ts` registers ReAct and Plan-and-Execute. Reflection is applied by wrapping the selected strategy in the same HTTP path.
- The currently installed dependency tree includes `js-tiktoken` through LangChain packages. This feature should declare it directly so the builder's import is supported independently of transitive dependency changes.
- There is no existing context directory, token budget parser, or token-counting helper in `src/`.
- No unresolved technical clarifications remain.
