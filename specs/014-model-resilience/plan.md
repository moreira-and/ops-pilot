# Implementation Plan: Resiliência de Modelo

**Branch**: `[014-model-resilience]` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-model-resilience/spec.md`

## Summary

A fábrica [model.ts](../../src/agents/model.ts) passa a devolver o modelo primário com `withRetry` e, quando `OPENROUTER_MODEL_FALLBACK` estiver definida, encadeado a `withFallbacks([reserva])`. Um recorder de callbacks (no estilo de `ModelCallCounter`) captura falhas/fallbacks e o modelo que respondeu, alimentando o evento de trace `fallback` e `metrics.modelUsed`. Quando primário e reserva esgotam, um `ModelUnavailableError` (erro de domínio) atravessa as estratégias e o serviço de chat e é traduzido para HTTP 503 em [server.ts](../../src/http/server.ts).

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: `@langchain/openai` (`ChatOpenAI`), `@langchain/core` (`withRetry`, `withFallbacks`, callbacks), Express, Zod

**Storage**: N/A (sem mudança de persistência)

**Testing**: `node:test` via `tsx`; modelos falsos injetados por `modelFactory`

**Target Platform**: Linux server (API HTTP), CLIs `arena` e `bench`

**Project Type**: web-service

**Performance Goals**: retentativas limitadas (2) para não estourar o timeout de estratégia da API

**Constraints**: não vazar detalhes/segredos no 503; `.env` não é lido nem versionado

**Scale/Scope**: um reserva; vale para todas as chamadas via `createModel`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- I. MVC/pureza: classificação de erro transitório e montagem de config são funções puras; efeitos só na fábrica e na borda HTTP. ✅
- II. Zod nas bordas: config nova validada com Zod; corpo 503 e `metrics`/`trace` estendidos nos schemas Zod. ✅
- III. Erros de domínio: `ModelUnavailableError` como classe, traduzida na borda. ✅
- Testes junto com a lógica; `typecheck` e `test` verdes. ✅
- Sem nova dependência nem persistência (princípio VI não afetado). ✅

Pós-design: sem violações.

## Project Structure

### Documentation (this feature)

```text
specs/014-model-resilience/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-503.md
│   └── trace-metrics.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── model.ts            # config do reserva, withRetry/withFallbacks, ModelUnavailableError
│   ├── model-usage.ts      # novo: recorder de callbacks (fallback, modelUsed) + classificador transitório
│   ├── reasoning.ts        # trace "fallback"; metrics.modelUsed
│   ├── react.ts / plan-and-execute.ts / reflection.ts  # relançar ModelUnavailableError em vez de "[FAILED]"
│   └── production-graph.ts # anexar eventos e modelUsed ao resultado
├── services/chat-service.ts # propagar o erro
└── http/server.ts           # 503
.env.example                 # OPENROUTER_MODEL_FALLBACK
README.md                    # documentar variável
```

**Structure Decision**: projeto único existente; mudanças pontuais nas camadas agents/services/http, com testes ao lado de cada arquivo.

## Complexity Tracking

Sem violações.
