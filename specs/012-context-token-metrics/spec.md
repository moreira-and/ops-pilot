# Feature Specification: Context Token Metrics

**Feature Branch**: `012-context-token-metrics`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Instrumente a medição de contexto src/context/tokens.ts com estimateTokens (chars/4) e o usage real do LangChain; métricas do /chat com promptTokens real e contextBreakdown estimado por fonte; conversa-longa.sh imprime o promptTokens por turno. Com testes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See real prompt size per chat reply (Priority: P1)

As an on-call operator, I want each chat reply's metrics to report the real number of prompt tokens consumed by the model provider, so that I know how much context each turn actually costs.

**Why this priority**: The real provider-reported figure is the ground truth for cost and context-limit decisions.

**Independent Test**: Send a chat message with a model that reports usage and verify the metrics contain that exact prompt-token count.

**Acceptance Scenarios**:

1. **Given** a model call that reports token usage, **When** a chat turn completes, **Then** the metrics include `promptTokens` equal to the reported prompt tokens (summed across all model calls in the turn).
2. **Given** a model call that reports no usage, **When** a chat turn completes, **Then** the reply still succeeds and `promptTokens` is explicitly absent/unavailable rather than guessed or zero.

---

### User Story 2 - Understand what fills the context (Priority: P1)

As an on-call operator, I want an estimated breakdown of context size by source (system instructions, summary, recent history, memories, current message), so that I can tell which source dominates the prompt.

**Why this priority**: Without per-source visibility, the real total cannot be acted upon.

**Independent Test**: Build a context with known text per source and verify `contextBreakdown` holds the estimate (characters ÷ 4, rounded up) for each source.

**Acceptance Scenarios**:

1. **Given** a built context, **When** metrics are produced, **Then** `contextBreakdown` lists an estimated token count for every source, each computed as characters divided by 4 rounded up.
2. **Given** an empty or absent source, **When** metrics are produced, **Then** that source's estimate is 0.
3. **Given** the same text, **When** estimated repeatedly, **Then** the result is identical (deterministic).

---

### User Story 3 - Follow token growth in a long conversation (Priority: P2)

As a developer, I want the long-conversation script to print `promptTokens` for every turn, so that I can observe how context grows and when budgeting takes effect.

**Why this priority**: It makes the metrics observable end to end, but depends on Stories 1–2.

**Independent Test**: Run the script against a running service and verify one `promptTokens` line per turn.

**Acceptance Scenarios**:

1. **Given** a running service, **When** `conversa-longa.sh` runs N turns, **Then** it prints N lines, each with the turn number and its `promptTokens`.
2. **Given** a turn without `promptTokens`, **When** the script prints it, **Then** it shows an explicit "n/a" marker and continues.

### Edge Cases

- Provider usage missing or malformed: reply unaffected, `promptTokens` unavailable.
- Multiple model calls in one turn (tools/reasoning loops): real tokens are summed.
- Non-ASCII or empty text: estimate never negative or fractional; empty text is 0.
- Estimated total differs from real total: both are reported without reconciliation.
- Service returns an error in a script turn: script reports the failure for that turn.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a token estimation capability returning ceil(characters / 4) for any text, 0 for empty text.
- **FR-002**: System MUST capture the provider-reported prompt-token usage for every model call in a chat turn and sum it.
- **FR-003**: Chat metrics MUST include `promptTokens` with the real summed value when reported, and MUST mark it unavailable otherwise.
- **FR-004**: Chat metrics MUST include `contextBreakdown` with estimated tokens for each context source, using the estimation in FR-001.
- **FR-005**: Metrics output MUST be validated at the boundary and remain backward compatible with existing metrics fields.
- **FR-006**: `conversa-longa.sh` MUST print `promptTokens` for each turn.
- **FR-007**: Measurement MUST NOT alter prompt contents, context budgeting, or reply behavior.
- **FR-008**: The feature MUST be covered by automated tests for estimation, usage capture (present and absent), breakdown, and metrics output.

### Key Entities

- **Token Estimate**: Approximate token count of a text (characters ÷ 4, rounded up).
- **Prompt Usage**: Real prompt tokens reported by the model provider, summed per turn.
- **Context Breakdown**: Estimated tokens per context source for one turn.
- **Chat Metrics**: Per-reply measurements including `promptTokens` and `contextBreakdown`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of chat replies whose provider reports usage show a `promptTokens` equal to the reported sum.
- **SC-002**: 100% of chat replies include a breakdown covering every context source.
- **SC-003**: Estimation is exact to the ceil(chars/4) rule on all test inputs, including empty text.
- **SC-004**: A developer sees per-turn token growth for a 10-turn conversation with a single script run.
- **SC-005**: Existing chat behavior and tests remain unchanged.

## Assumptions

- Builds on the context sections from 011-context-budgeting (system, summary, history, memories, message).
- The 4-characters-per-token estimate is intentionally approximate; real usage is authoritative.
- `conversa-longa.sh` does not exist yet and will be created, targeting the local service with a configurable base URL.
- Metrics are returned in the existing `/chat` response metrics; no persistence of token metrics in this feature.
