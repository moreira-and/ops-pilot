# OpsPilot

OpsPilot é um copiloto de plantão para investigar alertas de produção e executar operações básicas de incidentes por meio de agentes de linguagem. A aplicação oferece uma API HTTP de chat e ferramentas de linha de comando para executar e comparar estratégias de raciocínio.

## Funcionalidades

- Lista alertas por estado (`firing`, `resolved` ou `all`).
- Abre incidentes para serviços conhecidos e resolve incidentes existentes.
- Disponibiliza duas estratégias: ReAct e plan-and-execute. Ambas podem ser executadas com a camada opcional de reflexão.
- Registra rastros das ações e observações dos agentes, além de métricas de chamadas ao modelo e latência.
- Inclui um cenário Mercadinho com cinco serviços, seis alertas e runbooks operacionais.
- Disponibiliza uma arena de estratégias e um benchmark com cenários operacionais.

## Tecnologias

- Node.js 22.13+ LTS e TypeScript ESM em modo estrito.
- Express 5 e Zod para a API e validação de dados.
- LangChain e LangGraph para os agentes; OpenRouter como provedor de modelos.
- SQLite embutido via `node:sqlite` para persistência operacional.
- Testes com `node:test` e `tsx`.

## Arquitetura e estrutura

O código está organizado por responsabilidade em `src/`:

- `http/`: aplicação Express e rota de chat.
- `agents/`: estratégias de raciocínio, reflexão, ferramentas e rastros.
- `services/`: regras operacionais e contratos do armazenamento.
- `store/`: adaptador SQLite operacional.
- `models/` e `migrations/`: modelos Sequelize, configuração do banco e migrações.
- `scripts/`: dados e comandos auxiliares de demonstração.

O servidor e as ferramentas operacionais usam SQLite no caminho configurado por `OPSPILOT_DB`
(padrão `./data/opspilot.db`). Serviços, alertas, incidentes e runbooks permanecem disponíveis
após reinícios. A criação do schema e a carga do cenário Mercadinho são idempotentes. O adaptador
em memória permanece disponível para testes e benchmarks isolados; arquivos locais de banco em
`data/` não são versionados. Os artefatos Sequelize/MySQL legados não fazem parte do fluxo ativo
de persistência operacional.

## Pré-requisitos e instalação

- Node.js 22.13+ LTS.
- npm.
- Uma chave e um identificador de modelo do OpenRouter para executar estratégias que chamam o modelo.

Instale as dependências na raiz do repositório:

```sh
npm install
```

## Configuração e execução

O Node carrega automaticamente as variáveis de um arquivo `.env`, quando presente. Configure `OPENROUTER_API_KEY` e `OPENROUTES_MODEL` no ambiente local para executar os agentes com o OpenRouter. Não versione credenciais. A variável opcional `PORT` define a porta HTTP; o padrão é `3000`.

Inicie a API:

```sh
npm run dev
```

Envie uma mensagem para `POST /chat`. A estratégia padrão é `react`; a alternativa é `plan-and-execute`. O campo `reflact` (com essa grafia na API) habilita a reflexão, que faz chamadas adicionais ao modelo após a operação:

```sh
curl -s http://localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"message":"abra um incidente sev2 para o catalog","strategy":"react"}' \
  | jq '{answer, llmCalls: .metrics.llmCalls}'
```

Uma resposta bem-sucedida contém `answer`, `trace` e `metrics`. Requisições inválidas retornam `400`, estratégias desconhecidas retornam `422` e a execução pode retornar `504` ao exceder o limite de 180 segundos.

### Arena de estratégias

Execute uma ou mais estratégias sobre a mesma solicitação:

```sh
npm run arena -- --input "Resuma os alertas disparando" --strategies react,plan-and-execute --max-iterations 8
```

Também são aceitos os seletores `reflect:react` e `reflect:plan-and-execute`. A arena executa as estratégias em sequência; elas compartilham as ferramentas operacionais e suas alterações são persistidas no banco SQLite. O benchmark, por outro lado, executa cada combinação de cenário e estratégia em uma store em memória isolada.

### Benchmark

Execute os cenários `C1`, `C2` e `C3` com as estratégias ReAct e plan-and-execute:

```sh
npm run bench
```

O benchmark requer configuração do OpenRouter e imprime uma tabela com acerto, chamadas ao modelo e latência.

## Testes e verificação

Os testes automatizados usam dados e dependências controlados e não precisam de credenciais do OpenRouter:

```sh
npm test
npm run typecheck
```

O comando a seguir carrega/verifica o cenário Mercadinho no banco configurado por
`OPSPILOT_DB` (ou em `./data/opspilot.db` por padrão):

```sh
npm run seed:demo
```

O cenário possui cinco serviços e seis alertas (três `firing` e três `resolved`), além de
runbooks para `checkout`, `payments` e `auth`. A ferramenta `list_incidents` filtra por `open`,
`resolved` ou `all` (padrão `open`); `consultar_runbook` retorna o procedimento do serviço
solicitado sem executá-lo.
