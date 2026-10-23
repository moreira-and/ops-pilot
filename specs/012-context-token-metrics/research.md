# Research: Context Token Metrics

## Estimation
- **Decision**: `estimateTokens(text) = Math.ceil(text.length / 4)`; empty → 0.
- **Rationale**: Required by spec; cheap, deterministic, independent of the tiktoken encoder used for budgeting in 011.
- **Alternatives**: Reuse tiktoken (exact for OpenAI only, not requested).

## Real usage capture
- **Decision**: Extend `ModelCallCounter.handleLLMEnd` to read `output.llmOutput.tokenUsage.promptTokens` (OpenAI-compatible/OpenRouter) falling back to `generations[0][0].message.usage_metadata.input_tokens`; sum per run id; expose `promptTokens: number | undefined` (undefined if no call reported usage).
- **Rationale**: Counter is already attached to every model call in react/reflection; run-id keyed map avoids double counting.
- **Alternatives**: Wrapping the model (more invasive); parsing provider HTTP responses (bypasses LangChain).

## Breakdown sources
- **Decision**: Keys `system`, `summary`, `history`, `memories`, `message`, estimated from the text actually placed in the prompt (post-budget). `system` is strategy-owned and not visible to the chat service, so it is reported as 0 unless exposed later.
- **Rationale**: Keeps service-level computation pure; spec requires every source present.
- **Alternatives**: Move system prompts into the service (out of scope).

## Metrics plumbing
- **Decision**: `reasoningMetricsSchema` gets optional `promptTokens`; chat response metrics add `contextBreakdown` (required record of non-negative ints).
- **Rationale**: Backward compatible for arena/bench/other strategies.

## Script
- **Decision**: `conversa-longa.sh` (repo root) loops N turns (default 10) with one `conversationId`, POSTs to `${BASE_URL:-http://localhost:3000}/chat`, prints `turno N promptTokens=<n|n/a>` using `node -e` for JSON parsing (no jq dependency).
