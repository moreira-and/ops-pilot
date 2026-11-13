# Implementation Plan: War Room Web

**Branch**: `017-war-room-web` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-war-room-web/spec.md`

## Summary

Criar uma interface web de plantão em `web/`, publicada sob `/opspilot/`, que usa o endereço-base de API configurado pelo operador para conversar em `/chat`, abrir traces tipados e apresentar cada ação pendente retornada em HTTP 202 como cartão de aprovação. Estender a API existente para devolver 202 e persistir solicitações de ação antes da execução; somente uma decisão explícita de aprovar pode executar uma ação operacional. Configurar CORS com uma origem de interface autorizada, sem confundir CORS ou o ID anônimo do navegador com autenticação.

## Technical Context

**Language/Version**: TypeScript ESM com `strict: true`, Node.js 22 LTS e JSX tipado

**Primary Dependencies**: Express 5, Zod 4 e `node:sqlite` existentes; adicionar Vite, `@vitejs/plugin-react`, React, React DOM, `@types/react`, `@types/react-dom`, `cors` e `@types/cors`

**Storage**: SQLite embutido para ações pendentes e resultados; `localStorage` para URL da API, ID anônimo do navegador e conversa ativa

**Testing**: `node:test` via `tsx`, estratégias e serviços fake, SQLite `:memory:`, validação TypeScript do frontend e build Vite; cenários de interação manual documentados no quickstart

**Target Platform**: API Node.js em Linux e navegadores modernos; arquivos estáticos publicados sob `/opspilot/`

**Project Type**: Aplicação web com frontend estático e API HTTP existente

**Performance Goals**: Não há SLA de latência adicional definido; o cliente deve manter a interface responsiva durante solicitações e decisões e nunca apresentar uma decisão antes da confirmação da API

**Constraints**: Preservar os contratos atuais de chat 200, trace e métricas; validar entrada e saída de fronteira com Zod; adotar CORS com allowlist exata e sem credenciais; manter IDs anônimos distintos de autenticação; usar statements SQLite preparados e parâmetros vinculados; não executar ações pendentes antes da aprovação; não colocar segredos em valores `VITE_*`

**Scale/Scope**: Uma sala de conversa por navegador e endpoint de API configurado; aprovações para as ações operacionais existentes de abrir e resolver incidentes; sem autenticação, sincronização entre navegadores, gestão de múltiplas conversas na interface ou hospedagem estática específica de provedor

## Constitution Check — Pré-pesquisa

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan |
|-----------|------|------|
| I. Explicit MVC Layers and Pure Domain Logic | Pass | A borda HTTP valida contratos; serviços coordenam a criação e a decisão de ações; stores concentram persistência; componentes React cuidam da apresentação. |
| II. Validate at Boundaries with Zod | Pass | Validar mensagens, URL configurada, respostas 200/202, trace tipado, decisões e saídas HTTP antes de cruzarem as respectivas fronteiras. |
| III. Represent Domain Errors Explicitly | Pass | Modelar ação ausente, decisão conflitante e falhas operacionais como erros explícitos e traduzi-los para status HTTP; nunca converter falha em aprovação. |
| IV. Tests and Quality Gates | Pass | Incluir testes `node:test` para serviços, store, cliente e contrato; executar `npm run typecheck`, `npm test` e o build do frontend. |
| V. Security by Default | Pass with deployment assumption | Somente a origem autorizada da interface recebe CORS; decisões exigem clique explícito e execução posterior confirmada. O ID aleatório por navegador não autentica: a implantação deve restringir a API por controles externos. Não usar segredos no bundle. |
| VI. Embedded SQLite Persistence | Pass | Persistir ações e estados no SQLite embutido com consultas preparadas, parâmetros vinculados e testes em memória. |

**Gate result**: PASS, condicionado à restrição de acesso à API pela infraestrutura de implantação. O CORS configurado não substitui autenticação nem controle de rede.

## Project Structure

### Documentation (this feature)

```text
specs/017-war-room-web/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── war-room-http.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── tools.ts                         # ações operacionais postergadas até aprovação
│   └── index.ts                         # injeta dependências de aprovação na API
├── contracts/
│   └── war-room.ts                      # schemas Zod compartilhados de chat e aprovação
├── http/
│   ├── server.ts                        # CORS, respostas 202 e decisão de ações
│   └── server.test.ts                   # contrato HTTP, CORS e fluxo de aprovação
├── services/
│   ├── pending-action-service.ts        # estados, decisões e execução controlada
│   └── pending-action-store.ts          # schemas e interface do store
├── store/
│   ├── sqlite-pending-action-store.ts   # fila persistida e decisões idempotentes
│   └── sqlite-pending-action-store.test.ts
└── index.ts                             # configuração de serviço e origem CORS

package.json                             # dependências e scripts para a aplicação web
.env.example                             # exemplo local de CORS_ORIGIN sem credenciais novas

web/
├── index.html
├── vite.config.ts                       # base pública /opspilot/
├── tsconfig.app.json
└── src/
    ├── api/
    │   ├── client.ts                    # fetch tipado e tratamento de 200/202/erros
    │   └── settings.ts                  # URL e ID anônimo persistidos
    ├── components/
    │   ├── ChatRoom.tsx
    │   ├── TraceViewer.tsx
    │   ├── PendingActionCard.tsx
    │   └── ApiSettings.tsx
    ├── app-state.ts                     # estado puro de conversa e decisão
    └── *.test.ts                        # cliente, validação e transições de estado
```

**Structure Decision**: Manter o backend no `src/` e criar um frontend Vite + React + TypeScript no `web/`, sem introduzir um terceiro projeto ou pacote de workspace. Schemas Zod de fronteira ficam em `src/contracts/war-room.ts`, um módulo compartilhado sem efeitos colaterais, para que servidor e cliente validem o mesmo contrato. O frontend usa `import.meta.env.BASE_URL` para recursos locais e uma configuração de API validada em runtime; o endereço escolhido não é tratado como segredo. A API injeta o serviço e o store de ações pendentes nas estratégias HTTP e lista as ações ativas do ID de navegador para restaurar cartões após recarga. Somente `open_incident` e `resolve_incident` passam pelo fluxo de aprovação; ferramentas de leitura permanecem inalteradas, e `forget_preference` mantém a exigência existente de solicitação explícita do usuário. O `userId` atual do contrato é um UUID gerado e retido por navegador, sem valor de autenticação. Os scripts do pacote raiz devem incluir dev/build/preview do Vite e ampliar typecheck/test para também cobrir o frontend sem trocar `node:test`.

## Phase 0: Research

Ver [research.md](./research.md). A pesquisa confirmou as formas de deploy e configuração do frontend, a necessidade de CORS na API e as diferenças entre o contrato HTTP existente e o fluxo de aprovação solicitado. Não há decisões bloqueadoras pendentes.

## Phase 1: Design & Contracts

- [Modelo de dados](./data-model.md): identidade anônima local, mensagens/trace e ciclo de vida persistido de ações pendentes.
- [Contrato HTTP](./contracts/war-room-http.md): respostas 200/202, envio de decisão, falhas e configuração CORS.
- [Quickstart](./quickstart.md): testes determinísticos, build, execução local e publicação sob `/opspilot/`.

**Post-design Constitution Check**: PASS. A API mantém separação MVC, valida os contratos de entrada e saída com Zod, traduz erros de domínio explicitamente e persiste decisões com SQLite. As ações somente são executadas após aprovação explícita; o ID do navegador não é autorização e o requisito de restrição de rede permanece documentado para a implantação.

## Complexity Tracking

Sem violações constitucionais. O frontend separado é exigido pela escolha explícita de Vite + React + TypeScript; os demais módulos estendem o serviço HTTP e a persistência existentes, sem criar um serviço ou banco externo.
