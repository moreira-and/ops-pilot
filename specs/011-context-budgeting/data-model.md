# Data Model: Context Budgeting

The feature introduces no persisted records. It transforms the validated chat context into a prompt string immediately before strategy invocation; original conversation messages, summary text, memories, and the latest user message remain unchanged in their source structures. Strategy-specific system prompts are held and sent by the strategies separately; the context builder neither receives nor modifies them.

## Context Input

| Field | Shape | Validation and use |
|-------|-------|--------------------|
| `message` | Latest user message text | Required; inserted unchanged and never shortened or removed by section budgets. |
| `summary` | Nullable summary text | Optional section; clipped at a token boundary to its section budget. |
| `history` | Ordered conversation messages, each with role and content | Optional section; oldest whole messages are dropped first; remaining entries retain chronological order. |
| `memories` | Ordered items with a fact and finite relevance score | Optional section; lowest-scoring whole items are removed first, with stable input order for ties. |

## Context Budget

An immutable set of section ceilings after defaults and environment overrides are combined.

| Property | Default | Constraint |
|----------|---------|------------|
| `summary` | 200 tokens | Non-negative integer |
| `history` | 1,200 tokens | Non-negative integer |
| `memories` | 300 tokens | Non-negative integer |

`CONTEXT_BUDGET` is an optional JSON object with these properties. Missing properties use defaults. Malformed JSON, unknown properties, or invalid property values raise a typed configuration error. Each budget measures the complete rendered section, including heading and formatting separators.

## Rendered Prompt

Sections retain the established chat format: summary, relevant memories, conversation history, followed by the latest `User:` message. Empty or disabled optional sections are omitted. The latest message remains unchanged; strategy-specific system prompts are sent separately and are not reduced.

The history section is cut by dropping its oldest whole rendered messages until the token ceiling is met. The memory section is reduced by excluding its lowest-score items until it fits; remaining memories are rendered in their input order. The summary is shortened to the longest leading token sequence that fits its complete rendered section.

## Relationships and Lifecycle

- One `ContextBudget` applies to each prompt-build operation.
- One build consumes zero or one summary, an ordered history list, and an ordered scored-memory list.
- One build produces a prompt string for the selected reasoning strategy.
- The resulting prompt is ephemeral; it is not stored as the conversation message or returned as a new API field.
