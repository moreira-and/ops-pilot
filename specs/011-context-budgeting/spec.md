# Feature Specification: Context Budgeting

**Feature Branch**: `011-context-budgeting`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "ContextBuilder com orçamento por seção: src/context/context-builder.ts monta o prompt de TODAS as estratégias com teto por seção via env CONTEXT_BUDGET. + system e mensagem intocáveis, resumo 200, janela 1200 (corta as mais antigas), memórias 300 (corta menor score). Teste: tetos baixos cortam na ordem certa"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preserve essential context across strategies (Priority: P1)

As an on-call operator, I want every reasoning strategy to receive the same essential system instructions and my complete latest message, so that context limits never change the task or its operating constraints.

**Why this priority**: Preserving instructions and the current request is necessary for safe and useful incident assistance.

**Independent Test**: Build prompts for every supported strategy with deliberately restrictive section limits and verify that each contains the original system instructions and latest message unchanged.

**Acceptance Scenarios**:

1. **Given** a request with system instructions and a latest user message, **When** any supported strategy builds its prompt, **Then** both are present unchanged even if other content must be reduced.
2. **Given** multiple supported strategies and identical input context, **When** their prompts are built, **Then** each follows the same section limits and reduction rules.

### User Story 2 - Keep useful history and memories within limits (Priority: P1)

As an on-call operator, I want summaries, recent conversation, and relevant memories to stay within their individual limits, so that the agent receives useful context without older or less relevant material crowding it out.

**Why this priority**: Predictable context limits control prompt size while retaining the newest history and highest-scoring memories.

**Independent Test**: Supply oversized sections and verify the summary is at most 200 tokens, the recent-history section is at most 1,200 tokens after removing its oldest messages first, and the memories section is at most 300 tokens after removing its lowest-scoring memories first.

**Acceptance Scenarios**:

1. **Given** a summary longer than its limit, **When** a prompt is built, **Then** the included summary does not exceed 200 tokens.
2. **Given** recent conversation exceeding its limit, **When** a prompt is built, **Then** oldest messages are removed first, remaining messages stay in chronological order, and the section does not exceed 1,200 tokens.
3. **Given** memories exceeding their limit, **When** a prompt is built, **Then** memories with the lowest scores are removed first and the included section does not exceed 300 tokens.
4. **Given** section limits supplied through `CONTEXT_BUDGET`, **When** the setting provides lower limits, **Then** each affected section is reduced to its configured limit using its defined reduction rule.
5. **Given** `CONTEXT_BUDGET` is absent, **When** a prompt is built, **Then** the default section limits are applied; **Given** it contains an invalid limit, **When** prompt construction is requested, **Then** the configuration problem is reported explicitly.

### User Story 3 - Verify budget behavior deterministically (Priority: P2)

As a maintainer, I want low section limits to produce predictable cuts in automated tests, so that changes to prompt construction do not silently remove essential input or prioritize context incorrectly.

**Why this priority**: Deterministic regression checks protect behavior across all strategies as prompt content evolves.

**Independent Test**: Run automated tests with low configured limits and representative summary, history, and scored-memory content; verify section sizes, cut order, and preservation of essential input without external services.

**Acceptance Scenarios**:

1. **Given** deliberately low section limits and content exceeding each one, **When** prompt construction runs, **Then** the resulting sections satisfy their limits and follow the specified removal order.
2. **Given** any supported strategy, **When** the low-limit test is run, **Then** its prompt preserves system instructions and the latest message and applies the same reduction behavior.

### Edge Cases

- A section is already shorter than its configured limit; it remains unchanged.
- A single recent message or memory is larger than its entire section limit; the whole message or memory is removed if necessary to satisfy the limit, rather than retaining a partial item.
- The configured limit for a section is lower than the content needed for that section; only that section is reduced, while system instructions and the latest user message remain unchanged.
- `CONTEXT_BUDGET` is absent; the specified default limits are used.
- `CONTEXT_BUDGET` contains an invalid limit; the configuration problem is reported explicitly rather than silently producing an invalid or unbounded prompt.
- A strategy is added or changed; it still receives prompts built under the same preservation and section-budget rules.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All supported reasoning strategies MUST receive prompts assembled with the same context sections and reduction rules.
- **FR-002**: System instructions and the latest user message MUST be included unchanged and MUST NOT be shortened or removed by section limits.
- **FR-003**: The system MUST enforce independent token ceilings for the summary, recent conversation, and memories; their default ceilings MUST be 200, 1,200, and 300 tokens respectively.
- **FR-004**: The system MUST allow section ceilings to be configured through `CONTEXT_BUDGET`; an unspecified setting MUST use the defaults in FR-003.
- **FR-005**: When recent conversation exceeds its ceiling, the system MUST remove the oldest whole messages first and preserve chronological order among the messages that remain.
- **FR-006**: When memories exceed their ceiling, the system MUST remove the lowest-scoring memories first; equal-scored memories MUST be handled deterministically.
- **FR-007**: When a summary exceeds its ceiling, the system MUST reduce the included summary so that it does not exceed that ceiling.
- **FR-008**: The system MUST report invalid section-limit configuration explicitly.
- **FR-009**: Automated tests MUST use low section ceilings to verify that each section stays within its ceiling, cuts content according to its specified rule, and leaves system instructions and the latest user message unchanged.
- **FR-010**: Automated tests MUST verify consistent budget behavior for every supported reasoning strategy without requiring external model-provider access.

### Key Entities

- **Context section**: A category of material included in a prompt: system instructions, latest user message, summary, recent conversation, or memories.
- **Section budget**: The maximum token count permitted for a configurable context section, including its default and any configured override.
- **Scored memory**: A memory item with a relevance score that determines its removal order when the memories section exceeds its budget.
- **Reasoning strategy**: A supported way of responding to an operational request that receives the assembled prompt.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of tested strategy prompt builds, system instructions and the latest user message are present unchanged, including when section limits are deliberately lower than the supplied context.
- **SC-002**: In 100% of tested prompt builds, summary, recent conversation, and memories do not exceed their respective configured ceilings, or their stated defaults when no override is supplied.
- **SC-003**: In 100% of over-limit history and memory tests, the oldest history is removed before newer history and the lowest-scoring memories are removed before higher-scoring memories.
- **SC-004**: Every supported strategy passes the same deterministic low-limit behavior tests without external provider access.

## Assumptions

- The numeric section limits are measured in tokens.
- The values 200, 1,200, and 300 are the defaults; a valid `CONTEXT_BUDGET` override can set a different ceiling for an individual section.
- The protected system instructions and latest user message are outside these three section ceilings, so the combined prompt may exceed their sum.
- When memory scores tie, the existing stable input order is retained so the removal result is deterministic.
- Reducing an over-limit summary must respect the summary ceiling; the exact summary-shortening method is not externally prescribed.
