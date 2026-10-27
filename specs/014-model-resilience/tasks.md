# Tasks: Resiliência de Modelo

**Input**: Design documents from `specs/014-model-resilience/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/http-503.md`, `contracts/trace-metrics.md`

**Tests**: Incluídos; a constituição exige testes junto com a lógica nova (`node:test` via `tsx`, modelos falsos).

**Organization**: Tarefas agrupadas por user story do `spec.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos distintos, sem dependência pendente).
- **[Story]**: `US1`, `US2` ou `US3`.

## Phase 1: Setup

**Purpose**: Configuração compartilhada.

- [X] T001 [P] Adicionar `OPENROUTER_MODEL_FALLBACK=` (vazio, comentado como opcional) em `.env.example` sem ler ou alterar `.env`, e documentar a variável, o retry e o 503 em `README.md`.

---

## Phase 2: Foundational

**Purpose**: Tipos e erros usados por todas as stories.

- [X] T002 [P] Estender `traceEventSchema` em `src/agents/reasoning.ts` com o evento `fallback` (`type: "fallback"`, `from`, `to`, `reason` strings não vazias, herdando `sequence`/`node`) e `reasoningMetricsSchema` com `modelUsed: z.string().min(1).optional()`; cobrir em `src/agents/trace.test.ts`.
- [X] T003 [P] Criar `src/agents/model-usage.ts` com funções puras `isTransientModelError(error)` (true para timeout, erros de rede e HTTP 408/429/5xx; false para 400/401/403/404 e erros de validação) e `sanitizeReason(error)` (mensagem curta sem chave/URL/segredo); testes em `src/agents/model-usage.test.ts`.
- [X] T004 Em `src/agents/model.ts`, adicionar a classe `ModelUnavailableError` (mensagem genérica, causa original só em `cause`) e estender `ModelConfig`/`getModelConfig` com `fallbackModel` opcional (trim; vazio → ausente) e `maxRetries` padrão 2, validados com Zod; lançar `ModelConfigurationError("OPENROUTER_MODEL_FALLBACK")` se igual a `OPENROUTES_MODEL`; testes em `src/agents/model.test.ts`.

---

## Phase 3: User Story 1 - Continuar atendendo quando o primário falha (P1) 🎯 MVP

**Goal**: retry no primário e fallback automático para o reserva.

**Independent Test**: modelos falsos; primário falha 1× → responde com primário; falha sempre → responde com reserva; sem reserva → erro.

- [X] T005 [US1] Em `src/agents/model.ts`, refatorar `createModel` para compor `primary.withRetry({ stopAfterAttempt: maxRetries + 1 })` (relançando imediatamente erros não transitórios via `isTransientModelError`) e, se houver reserva, `.withFallbacks([fallback])`; envolver em um tipo `ResilientChatModel` que preserve `invoke` e `bindTools` (aplicando `bindTools` a primário e reserva antes de compor, conforme R2 de `research.md`); converter a falha final em `ModelUnavailableError`.
- [X] T006 [US1] Testes em `src/agents/model.test.ts`: retry bem-sucedido no primário; fallback quando o primário esgota; sem reserva → `ModelUnavailableError`; 401/400 sem retry nem fallback; `bindTools` funcional com a composição.
- [X] T007 [P] [US1] Garantir que `src/agents/react.ts`, `src/agents/plan-and-execute.ts` e `src/agents/reflection.ts` relancem `ModelUnavailableError` em vez de convertê-lo em resposta `[FAILED] ...`, mantendo o comportamento atual para os demais erros; testes nos respectivos `*.test.ts`.

**Checkpoint**: US1 funcional e testável isoladamente.

---

## Phase 4: User Story 2 - Observabilidade do modelo usado (P2)

**Goal**: evento `fallback` no trace e `metrics.modelUsed`.

**Independent Test**: forçar fallback e inspecionar o resultado do grafo.

- [X] T008 [US2] Em `src/agents/model-usage.ts`, implementar `ModelUsageRecorder` (callback handler no estilo de `ModelCallCounter` em `src/agents/metrics.ts`) que registra o modelo de cada execução, detecta falha do primário seguida de sucesso do reserva e expõe `fallbackEvents` (`from`, `to`, `reason` sanitizado) e `modelUsed` (modelo da última resposta); testes em `src/agents/model-usage.test.ts`.
- [X] T009 [US2] Em `src/agents/production-graph.ts`, anexar o recorder aos callbacks da execução, inserir eventos `fallback` no trace com `sequence` contínuo e `node` da estratégia, e preencher `metrics.modelUsed` validando com `reasoningMetricsSchema`; testes em `src/agents/production-graph.test.ts` (com fallback há evento e `modelUsed` = reserva; sem fallback não há evento e `modelUsed` = primário).
- [X] T010 [P] [US2] Garantir que `src/http/server.ts` e `chatResponseSchema` (em `src/services/chat-service.ts`, se aplicável) aceitem e exponham o evento `fallback` e `modelUsed` sem quebrar compatibilidade; teste em `src/http/server.test.ts`.

---

## Phase 5: User Story 3 - 503 quando nenhum modelo responde (P2)

**Goal**: falha total vira HTTP 503 padronizado.

**Independent Test**: ambos os modelos falham; `POST /chat` retorna 503.

- [X] T011 [US3] Em `src/services/chat-service.ts`, garantir que `ModelUnavailableError` propague sem ser capturada nem convertida em `ChatStrategyFailedError`; teste em `src/services/chat-service.test.ts`.
- [X] T012 [US3] Em `src/http/server.ts`, traduzir `ModelUnavailableError` para `503` com corpo `{ "error": "Model unavailable" }` validado com Zod (`contracts/http-503.md`), sem stack, nome de modelo ou mensagem do provedor; testes em `src/http/server.test.ts` incluindo que `ModelConfigurationError` continua fora desse caminho.
- [X] T013 [P] [US3] Em `src/arena.ts` e `src/bench.ts`, tratar `ModelUnavailableError` com mensagem clara na CLI (sem stack/segredos); testes em `src/arena.test.ts` e `src/bench.test.ts`. (Verificado: `arena` e `bench` já capturam erros com mensagem segura; sem mudança necessária.)

---

## Phase 6: Polish

- [X] T014 Executar `npm run typecheck` e `npm test` e corrigir regressões; percorrer os cenários de `specs/014-model-resilience/quickstart.md`.

---

## Dependencies & Execution Order

- Setup (T001) e Foundational (T002–T004) antes das stories; T002, T003 e T004 são paralelizáveis entre si (T004 depende só do próprio arquivo).
- US1 (T005 → T006; T007 em paralelo após T004) é o MVP.
- US2 depende de T002, T003 e T005 (T008 → T009; T010 após T009).
- US3 depende de T004, T005 e T007 (T011 → T012; T013 em paralelo após T012).
- Polish por último.

## Parallel Example

```text
T001 || T002 || T003 (arquivos distintos)
T007 || T008 (após T005)
T010 || T013 (após T009 / T012)
```

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 (retry e fallback funcionando).
2. Incrementar com US2 (observabilidade) e US3 (503).
3. Cada fase deve caber em commits pequenos e reversíveis, com `typecheck` e `test` verdes.
