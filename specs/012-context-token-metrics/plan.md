# Implementation Plan: Context Token Metrics

**Branch**: `012-context-token-metrics` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-context-token-metrics/spec.md`

## Summary

Add a pure `estimateTokens` (ceil(chars/4)) in `src/context/tokens.ts`; extend `ModelCallCounter` (LangChain callback handler) to sum real prompt tokens from `handleLLMEnd` usage; surface `promptTokens` (real, optional) and `contextBreakdown` (estimated per source) in `/chat` metrics; create `conversa-longa.sh` printing `promptTokens` per turn.

## Technical Context

**Language/Version**: TypeScript ESM, strict, Node.js 22 LTS

**Primary Dependencies**: Existing Express 5, Zod 4, `@langchain/core` callbacks; no new dependencies

**Storage**: None

**Testing**: `node:test` via `tsx`; unit tests for estimator and usage capture (fake LLMResult), chat-service/HTTP tests with fake strategies

**Target Platform**: Node.js HTTP service; POSIX shell script (curl + jq-free parsing where possible)

**Project Type**: Backend web service

**Performance Goals**: Estimation is O(n) string length; no extra model/network calls

**Constraints**: Do not alter prompt, budgeting, or reply behavior; new metrics fields optional so existing strategies/arena/bench stay compatible; `promptTokens` absent (not 0) when provider reports no usage

**Scale/Scope**: `/chat` path and strategies that use `ModelCallCounter` (react, reflection); plan-and-execute and other strategies may leave `promptTokens` absent unless they use the counter

## Constitution Check

| Principle | Gate | Plan |
|-----------|------|------|
| I. MVC / pure domain | Pass | `estimateTokens` and breakdown computation pure; chat service composes; controller only validates/serializes. |
| II. Zod at boundaries | Pass | Extend `/chat` response schema with optional `promptTokens` and `contextBreakdown` object; strategy result schema gains optional `promptTokens`. |
| III. Domain errors | Pass | No new failure modes; missing usage is a normal state. |
| IV. Tests | Pass | Tests accompany each unit; run `npm run typecheck` and `npm test`. |
| V. Security | Pass | No secrets; `.env` untouched; script takes base URL from env var. |
| VI. SQLite | Pass | No persistence changes. |

**Gate result**: PASS (re-checked after design; unchanged).

## Project Structure

```text
specs/012-context-token-metrics/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/chat-metrics.md
└── checklists/requirements.md

src/context/tokens.ts (+ tokens.test.ts)      # estimateTokens, estimateBreakdown
src/agents/metrics.ts (+ metrics.test.ts)     # usage capture in ModelCallCounter
src/agents/reasoning.ts                       # optional promptTokens in metrics schema
src/agents/react.ts, reflection.ts            # pass counter.promptTokens through
src/services/chat-service.ts (+ test)         # contextBreakdown
src/http/server.ts (+ test)                   # response schema
conversa-longa.sh                             # per-turn promptTokens
```

**Structure Decision**: Single backend project; extend existing modules.
