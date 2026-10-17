# OpsPilot

OpsPilot é um copiloto de plantão para investigar alertas de produção e executar operações básicas de incidentes por meio de agentes de linguagem. A aplicação oferece uma API HTTP de chat e ferramentas de linha de comando para executar e comparar estratégias de raciocínio.

## Funcionalidades

- Lista alertas por estado (`firing`, `resolved` ou `all`).
- Abre incidentes para serviços conhecidos e resolve incidentes existentes.
- Disponibiliza duas estratégias: ReAct e plan-and-execute. Ambas podem ser executadas com a camada opcional de reflexão.
- Registra rastros das ações e observações dos agentes, além de métricas de chamadas ao modelo e latência.
- Inclui cenários de demonstração com seis serviços e sete alertas.
- Disponibiliza uma arena de estratégias e um benchmark com cenários operacionais.

## Tecnologias

- Node.js 22 LTS e TypeScript ESM em modo estrito.
- Express 5 e Zod para a API e validação de dados.
- LangChain e LangGraph para os agentes; OpenRouter como provedor de modelos.
- Sequelize, MySQL e Umzug estão presentes para persistência e migrações.
- Testes com `node:test` e `tsx`.

## Arquitetura e estrutura

O código está organizado por responsabilidade em `src/`:

- `http/`: aplicação Express e rota de chat.
- `agents/`: estratégias de raciocínio, reflexão, ferramentas e rastros.
- `services/`: regras operacionais e abstração/implementações do armazenamento.
- `models/` e `migrations/`: modelos Sequelize, configuração do banco e migrações.
- `scripts/`: dados e comandos auxiliares de demonstração.

O servidor e as ferramentas operacionais atualmente usam um armazenamento em memória iniciado com os dados de demonstração. Os adaptadores e migrações MySQL existem, mas ainda não estão conectados ao fluxo ativo da API ou dos agentes; portanto, alterações operacionais não persistem entre execuções.

## Pré-requisitos e instalação

- Node.js 22 LTS.
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

Envie uma mensagem para `POST /chat`. A estratégia padrão é `react`; a alternativa é `plan-and-execute`. O campo `reflact` (com essa grafia na API) habilita a reflexão:

```sh
curl -s http://localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"message":"abra um incidente sev2 para o catalog","strategy":"react","reflact":true}' \
  | jq '{answer, llmCalls: .metrics.llmCalls}'
```

Uma resposta bem-sucedida contém `answer`, `trace` e `metrics`. Requisições inválidas retornam `400`, estratégias desconhecidas retornam `422` e a execução pode retornar `504` ao exceder o limite de 180 segundos.

### Arena de estratégias

Execute uma ou mais estratégias sobre a mesma solicitação:

```sh
npm run arena -- --input "Resuma os alertas disparando" --strategies react,plan-and-execute --max-iterations 8
```

Também são aceitos os seletores `reflect:react` e `reflect:plan-and-execute`. A arena executa as estratégias em sequência; as alterações feitas nas ferramentas são compartilhadas durante aquela execução e descartadas ao final do processo.

### Benchmark

Execute os cenários `C1`, `C2` e `C3` com as estratégias ReAct e plan-and-execute:

```sh
npm run bench
```

O benchmark requer configuração do OpenRouter e imprime uma tabela com acerto, chamadas ao modelo e latência.

## Testes e verificação

Os testes automatizados usam dados e dependências controlados e não precisam de credenciais do OpenRouter ou do MySQL:

```sh
npm test
npm run typecheck
```

O comando a seguir valida os dados de demonstração em memória; ele não grava no MySQL:

```sh
npm run seed:demo
```
