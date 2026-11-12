# Implementation Plan: Métricas Agregadas de Solicitações

**Branch**: `[016-request-status-metrics]` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-request-status-metrics/spec.md`

## Summary

Adicionar `GET /status?since=24h` para resumir volume, falhas, tokens, custo estimado e latência das solicitações iniciadas na janela, com grupos por rota e por `modelUsed`. Estender a coleta de uso dos modelos para tokens de entrada e saída, persistir tokens de saída com migração SQLite aditiva e calcular os agregados em serviço puro a partir de uma consulta preparada e limitada à janela. O custo usa uma tabela local por modelo e valores em USD por milhão de tokens; `:free` custa zero e custos sem preço ou uso completo permanecem indisponíveis.

## Technical Context

**Language/Version**: TypeScript ESM com `strict: true`, Node.js 22 LTS

**Primary Dependencies**: Express 5, Zod 4, `node:sqlite` (`DatabaseSync`), LangChain JS existente, `node:test` via `tsx`; sem novas dependências

**Storage**: SQLite embutido, configurado por `OPSPILOT_DB`; reutiliza `requests`, preserva `prompt_tokens` como tokens de entrada e adiciona `completion_tokens` para tokens de saída. A migração precisa funcionar sobre bancos criados por versões anteriores.

**Testing**: Testes `node:test` com contadores fake, tabela de preços injetável, SQLite em memória e cenários HTTP end-to-end.

**Target Platform**: Serviço HTTP Node.js em Linux

**Project Type**: Backend web service

**Performance Goals**: Não há SLA de latência especificado. A consulta deve filtrar por início e limites temporais no SQLite, sem varrer registros fora da janela nem fazer chamadas externas.

**Constraints**: Validar `since` e resposta com Zod; usar statements preparados e parâmetros vinculados; percentis nearest-rank; incluir solicitações `running` nos totais; não atribuir custo zero a modelos pagos sem preço ou a solicitações com uso incompleto; manter os dados legados e o contrato existente de `promptTokens`.

**Scale/Scope**: Uma rota agregada sobre a tabela `requests`; janela padrão de 24 horas, agrupamentos por rota e modelo final registrado, sem listagem de traces, cobrança externa, painel UI ou reconciliação com faturas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan |
|-----------|------|------|
| I. Explicit MVC Layers and Pure Domain Logic | Pass | O controller valida query e saída; o serviço calcula grupos e percentis sem I/O; o store concentra SQL e compatibilidade de schema. |
| II. Validate at Boundaries with Zod | Pass | Validar duração recebida, métricas usadas no cálculo, preços e resposta HTTP. |
| III. Represent Domain Errors Explicitly | Pass | Duração inválida é traduzida para HTTP 400; falhas de persistência e leitura não são convertidas em métricas com formato de sucesso. |
| IV. Tests and Quality Gates | Pass | Cobrir contadores, migração, cálculos, custos e contrato HTTP com `node:test`; executar `npm run typecheck` e `npm test`. |
| V. Security by Default | Pass | O endpoint retorna agregados sem mensagens, trace ou identificadores de usuário. Nenhum segredo ou `.env` é lido. |
| VI. Embedded SQLite Persistence | Pass | Reutilizar `DatabaseSync`, statements preparados, filtro temporal vinculado, migração aditiva e testes `:memory:`. |

**Gate result**: PASS. A mudança permanece no serviço existente e não exige dependências, banco externo ou alteração constitucional.

## Project Structure

### Documentation (this feature)

```text
specs/016-request-status-metrics/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── status.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── metrics.ts                   # tokens de entrada e saída por chamada
│   ├── reasoning.ts                 # métricas opcionais de input/output
│   ├── react.ts                     # propaga uso do agente
│   ├── reflection.ts                # agrega tokens do agente e crítico
│   └── production-graph.ts          # agrega tokens do router e estratégia
├── http/
│   ├── server.ts                    # rota GET /status e schemas da borda
│   └── server.test.ts               # integração HTTP e validação
├── services/
│   ├── model-pricing.ts             # tabela e cálculo puro de custo estimado
│   ├── request-status-service.ts    # janela, grupos e nearest-rank p50/p95
│   └── request-trace-store.ts       # contrato e schema de leitura para status
└── store/
    ├── sqlite-request-trace-store.ts       # migração, índice e consulta temporal
    └── sqlite-request-trace-store.test.ts  # migração e isolamento temporal
```

**Structure Decision**: Reutilizar o store de solicitações e sua tabela `requests`. Uma interface de leitura retorna somente as colunas necessárias para o período; o serviço de status calcula métricas gerais e grupos por `route` e `modelUsed`. A instrumentação existente agrega uso por chamada do modelo, e a persistência mantém `prompt_tokens` e acrescenta `completion_tokens`. A tabela de preços e a função de custo ficam em módulo puro e injetável para permitir testes com valores determinísticos. O grupo por modelo representa o modelo efetivo registrado para a solicitação; os tokens permanecem agregados no nível da solicitação.

## Phase 0: Research

Ver [research.md](./research.md). Os pontos técnicos foram resolvidos com os contratos existentes, a documentação do uso de tokens LangChain/OpenRouter e a escolha do usuário por preços locais de entrada/saída.

## Phase 1: Design & Contracts

- [Modelo de dados](./data-model.md): campos legados e novos de uso, preço configurado e estrutura do agregado.
- [Contrato HTTP](./contracts/status.md): janela, corpo do resumo, grupos, custos indisponíveis e erro de validação.
- [Quickstart](./quickstart.md): comandos e cenários reproduzíveis para confirmar cálculo e migração.

**Post-design Constitution Check**: PASS. As responsabilidades MVC permanecem separadas, a leitura SQLite é preparada e limitada ao período, os dados de saída são validados, e a alteração de schema preserva bancos existentes.

## Complexity Tracking

Sem violações constitucionais; não é necessária justificativa de complexidade adicional.
