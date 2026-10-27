# Research: Resiliência de Modelo

## R1 — Composição retry + fallback
- **Decision**: `primary.withRetry({ stopAfterAttempt: 3 })` (1 chamada + 2 retentativas) e `.withFallbacks([fallback])`, com o reserva também sob `withRetry` leve (1 tentativa extra não é necessária: `stopAfterAttempt: 1`).
- **Rationale**: Atende o pedido (retry no primário, fallback para a reserva) com primitivas do LangChain; `ChatOpenAI` já usa `maxRetries: 0`, evitando retry duplo.
- **Alternatives**: wrapper manual (mais código e testes); retry do SDK OpenAI (oculta tentativas do trace).

## R2 — Compatibilidade com `bindTools`
- **Risk**: `RunnableWithFallbacks`/`withRetry` não expõem `bindTools`, usado por ReAct/Plan-and-Execute.
- **Decision**: aplicar `bindTools` em primário e reserva antes de compor quando necessário; a fábrica expõe um tipo `ResilientChatModel` com `invoke` e `bindTools` que delega a cada modelo e recompõe retry/fallback. Validar com teste na primeira tarefa.
- **Alternatives**: aplicar resiliência só nos pontos de `invoke` (invasivo, 5 call sites).

## R3 — Quais falhas são transitórias
- **Decision**: retry/fallback para timeout, erros de rede, HTTP 408/429/5xx; não para 400/401/403/404 nem erros de validação. Implementado via `onFailedAttempt` do `withRetry` (relança imediatamente os não transitórios) e classificador puro.
- **Rationale**: FR-008; evita gastar tentativas com credenciais inválidas.

## R4 — Capturar fallback e `modelUsed`
- **Decision**: callback handler (`ModelUsageRecorder`) usando `handleChatModelStart`/`handleLLMError`/`handleLLMEnd`: guarda nome do modelo por run; falha do primário seguida de sucesso do reserva gera evento `fallback { from, to, reason }`; o último `handleLLMEnd` define `modelUsed`.
- **Alternatives**: wrapper próprio com callback explícito (mais controle, mais código) — fallback se os callbacks não expuserem o nome do modelo de forma confiável.

## R5 — Propagação do 503
- **Problem**: estratégias convertem exceções em respostas `[FAILED] ...`, que viram 500.
- **Decision**: `ModelUnavailableError` (lançado quando primário e reserva esgotam) é relançado pelas estratégias e reflexão; `chat-service` não o captura; `server.ts` responde `503 { error: "Model unavailable" }`.
- **Alternatives**: marcador no texto `[FAILED]` (frágil).

## R6 — Nome da variável do modelo primário
- **Finding**: o código usa `OPENROUTES_MODEL` (grafia existente). Mantida; fora de escopo corrigir. Reserva usa `OPENROUTER_MODEL_FALLBACK` exatamente como pedido.

## R7 — Config inválida
- **Decision**: reserva vazio = desativado; reserva igual ao primário = `ModelConfigurationError` (FR-009).
