# Implementation Plan: Trace Persistido e Logs JSON

**Branch**: `[015-persisted-trace]` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-persisted-trace/spec.md`

## Summary

Adicionar correlação por `requestId` ao `/chat`, persistir os dados finais da execução e cada evento do trace em SQLite e disponibilizar a consulta em `GET /requests/:id`. O nó final do grafo registra o resultado completo (rota e métricas incluídas) através do serviço de persistência; o serviço emite o evento de log de conclusão com metadados. O ID é atribuído pela borda HTTP e propagado ao grafo. Stores e logger permanecem injetáveis para testes determinísticos.

## Technical Context

**Language/Version**: TypeScript ESM com `strict: true`, Node.js 22 LTS

**Primary Dependencies**: Express 5, Zod 4, `node:sqlite` (`DatabaseSync`), `node:test` via `tsx`; sem novas dependências

**Storage**: SQLite embutido, configurado por `OPSPILOT_DB` em produção e `:memory:` nos testes; tabelas `requests` e `trace_eventos`

**Testing**: Testes HTTP de integração e testes unitários com `node:test`; estratégias fake determinísticas e store SQLite em memória

**Target Platform**: Serviço HTTP Node.js em Linux

**Project Type**: Backend web service

**Performance Goals**: Não há SLA adicional definido. O registro e a leitura devem limitar o trabalho ao registro consultado e aos seus eventos, sem chamadas externas ou execução adicional do agente.

**Constraints**: Validar entrada e saída HTTP com Zod; usar statements preparados e parâmetros vinculados; preservar a ordem do trace mesmo com timestamps iguais; não incluir conteúdo de mensagens, respostas ou payloads nos logs; erros de persistência não podem ser reportados como sucesso.

**Scale/Scope**: Uma linha de registro e zero ou mais eventos por solicitação processada; inclui `POST /chat`, consulta individual por identificador e logs do serviço, sem busca/listagem, política de retenção ou alteração do formato semântico dos eventos existentes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan |
|-----------|------|------|
| I. Explicit MVC Layers and Pure Domain Logic | Pass | A camada HTTP valida/transcreve contratos; serviços coordenam o ciclo da solicitação; o adaptador de armazenamento concentra SQL e I/O. |
| II. Validate at Boundaries with Zod | Pass | Validar `requestId`, dados de registro, métricas e eventos ao entrar/sair das fronteiras e ao mapear dados persistidos. |
| III. Represent Domain Errors Explicitly | Pass | Representar registro ausente como erro de domínio e traduzi-lo para 404 na borda; falhas inesperadas/persistência não produzem resposta de sucesso. |
| IV. Tests and Quality Gates | Pass | Incluir testes `node:test` junto às novas unidades e integração HTTP; executar `npm run typecheck` e `npm test`. |
| V. Security by Default | Pass | Os logs usam metadados permitidos, nunca conteúdo de payload ou segredos. Testes usam dados fake; não é necessário ler `.env` nem fazer chamadas externas. |
| VI. Embedded SQLite Persistence | Pass | Usar `DatabaseSync`, DDL estático idempotente, statements preparados e valores vinculados; suportar `:memory:` nos testes. |

**Gate result**: PASS. Não há violações constitucionais nem decisões bloqueadoras pendentes.

## Project Structure

### Documentation (this feature)

```text
specs/015-persisted-trace/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── request-trace.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── http/
│   ├── server.ts                     # correlação e endpoints HTTP
│   └── server.test.ts                # integração determinística das rotas
├── agents/
│   ├── production-graph.ts           # estado requestId e persistência no nó final
│   ├── production-graph.test.ts      # testes do nó final e contexto
│   └── model-usage.ts                # snapshot de modelo/fallback no grafo
├── obs/
│   ├── logger.ts                     # uma linha JSON de metadados por evento
│   └── logger.test.ts
├── services/
│   ├── request-trace-store.ts        # modelos, schemas e interface do store
│   ├── request-trace-service.ts      # ciclo de vida e consulta de solicitação
│   └── domain-error.ts               # erro de registro inexistente
├── store/
│   ├── sqlite-request-trace-store.ts # persistência SQLite e ordenação
│   └── sqlite-request-trace-store.test.ts
└── index.ts                          # injeta store persistente na aplicação
```

**Structure Decision**: A rota gera o ID e inicia a execução pelo serviço de rastreamento. O estado do `production-graph` recebe esse ID; seu nó final compõe a resposta definitiva (inclusive fallback e modelo efetivamente usado) e chama o serviço para gravar a solicitação e os eventos em uma operação consistente. O serviço emite logs de início, conclusão e falha através do logger com allowlist `{ requestId, node, type, route, tokens }`. Isso segue a intenção do fluxo fornecido, mas mantém SQL no adaptador e serialização/allowlist na camada de observabilidade. A leitura do registro permanece no serviço HTTP, com store SQLite injetável e banco em memória nos testes. O DDL idempotente segue o padrão local, sem infraestrutura de migrações.

## Phase 0: Research

Ver [research.md](./research.md). As decisões foram resolvidas com base na Constituição, nas interfaces HTTP existentes, nos tipos de trace e nos stores SQLite atuais. Não há `NEEDS CLARIFICATION` pendente.

## Phase 1: Design & Contracts

- [Modelo de dados](./data-model.md): estados e campos de solicitações, métricas e eventos persistidos.
- [Contrato HTTP e logging](./contracts/request-trace.md): `/chat`, `/requests/:id`, respostas e limites do log JSON.
- [Quickstart](./quickstart.md): comandos e cenários determinísticos para validar os fluxos.

**Post-design Constitution Check**: PASS. O desenho preserva MVC, valida fronteiras com Zod, usa erros explícitos, mantém o SQLite embutido e preparado, e especifica testes sem rede nem dados sensíveis nos logs.

## Complexity Tracking

Sem violações constitucionais; não é necessária justificativa de complexidade adicional.
