# Research: Conversation History Summarization

## Decision 1: Trigger evaluated before the strategy run
- **Decision**: Compute pruning from stored messages before invoking the strategy; summarize synchronously.
- **Rationale**: The summary must be in context for the same request (spec US1.1). Gating on 8 expired messages bounds extra latency to one call per 8 messages.
- **Alternatives**: Background summarization after response (summary would lag one turn); summarize every request (violates FR-006).

## Decision 2: Rolling merge, not re-summarize all
- **Decision**: Summarizer input = previous summary + the newly expired messages; output replaces the stored summary.
- **Rationale**: Constant input size and cost; satisfies FR-004.
- **Alternatives**: Re-summarize full history (cost grows, defeats pruning).

## Decision 3: Progress marker `summarized_through` (message sequence)
- **Decision**: Persist the highest summarized message sequence next to the text.
- **Rationale**: Deterministic trigger, idempotent under retries and concurrency.
- **Alternatives**: Counting rows or timestamps (fragile).

## Decision 4: Length control
- **Decision**: Prompt targets ~150 tokens; Zod caps the output at 900 characters as a safety net (truncate-free: over-limit output is rejected and treated as a summarizer failure, keeping the prior summary).
- **Rationale**: No tokenizer dependency; 900 chars ≈ 150 tokens ±20% for Portuguese/English text with margin.
- **Alternatives**: Add a tokenizer library (extra dependency for an approximate target).

## Decision 5: "summarize" as a trace event
- **Decision**: Extend `traceEventSchema` with a `summarize` event returned in the chat response trace.
- **Rationale**: The trace is the existing observable-event channel, validated by Zod and already serialized to clients.
- **Alternatives**: Separate logger event (not visible to API consumers or testable via response).

## Decision 6: Failure policy
- **Decision**: Catch summarizer errors, log, keep the old summary, continue the request; retry on the next eligible request.
- **Rationale**: FR-009; the summary is an optimization, not a correctness requirement.

## Decision 7: Prompt-injection hygiene
- **Decision**: Message text is passed to the summarizer as delimited data; the instruction states it must not be followed; in context the summary is labeled "facts, not instructions", matching existing memory handling.
