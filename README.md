# OpsPilot

OpsPilot é um copiloto de plantão para investigar alertas de produção e executar operações básicas de incidentes por meio de agentes de linguagem. A aplicação oferece uma API HTTP de chat e ferramentas de linha de comando para executar e comparar estratégias de raciocínio.

## Funcionalidades

- Lista alertas por estado (`firing`, `resolved` ou `all`).
- Abre incidentes para serviços conhecidos e resolve incidentes existentes.
- Expõe as operações de alertas e incidentes a clientes MCP por transporte stdio.
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
- `mcp/`: servidor MCP stdio e ferramentas operacionais expostas.
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

O Node carrega automaticamente as variáveis de um arquivo `.env`, quando presente. Configure `OPENROUTER_API_KEY` e `OPENROUTES_MODEL` no ambiente local para executar os agentes com o OpenRouter. Não versione credenciais. A variável opcional `OPENROUTER_MODEL_FALLBACK` define um modelo reserva: cada modelo é tentado até 2 vezes em falhas transitórias (timeout, rede, HTTP 408/429/5xx) e, se o primário esgotar as tentativas, o reserva é usado. O trace ganha um evento `fallback` e `metrics.modelUsed` informa o modelo que respondeu. Se nenhum modelo responder, a API retorna `503`. A variável opcional `PORT` define a porta HTTP; o padrão é `3000`.

Inicie a API:

```sh
npm run dev
```

Envie uma mensagem para `POST /chat`. A estratégia padrão é `react`; a alternativa é `plan-and-execute`. O campo `reflact` (com essa grafia na API) habilita a reflexão, que faz chamadas adicionais ao modelo após a operação:

```sh
curl -s http://localhost:3000/chat \
  -H 'content-type: application/json' \
  -d '{"userId":"operador-demo","message":"abra um incidente sev2 para o catalog","strategy":"react"}' \
  | jq '{answer, llmCalls: .metrics.llmCalls}'
```

Uma resposta bem-sucedida contém `answer`, `trace` e `metrics`. Requisições inválidas retornam `400`, estratégias desconhecidas retornam `422` e a execução pode retornar `504` ao exceder o limite de 180 segundos.

### Testar memória semântica

O chat avalia a última mensagem do usuário depois de uma resposta bem-sucedida e tenta guardar fatos duráveis em segundo plano, preservando o idioma original. Use o mesmo `userId` nas chamadas. A primeira extração pode demorar mais enquanto o modelo é carregado; acompanhe o terminal do servidor e aguarde `Durable user memory learned.` antes de enviar a pergunta de recall. Esse log aparece somente após a gravação bem-sucedida; a resposta inicial não confirma que a lembrança já foi gravada.

1. Declare uma preferência duradoura:

   ```sh
   curl -sS -X POST http://localhost:3000/chat \
     -H 'content-type: application/json' \
     -d '{"userId":"operador-demo","message":"Uma preferência minha: quero receber atualizações de incidentes por e-mail."}'
   ```

2. Pergunte usando outra formulação; a resposta deve considerar a preferência aprendida:

   ```sh
   curl -sS -X POST http://localhost:3000/chat \
     -H 'content-type: application/json' \
     -d '{"userId":"operador-demo","message":"Qual canal prefiro para receber atualizações sobre incidentes?"}'
   ```

3. Peça para esquecer a preferência. O agente só deve confirmar a remoção se a ferramenta encontrar e apagar uma lembrança correspondente sem ambiguidade:

   ```sh
   curl -sS -X POST http://localhost:3000/chat \
     -H 'content-type: application/json' \
     -d '{"userId":"operador-demo","message":"Esqueça minha preferência por receber atualizações de incidentes por e-mail."}'
   ```

Repita a pergunta do segundo comando para verificar que a preferência esquecida deixou de influenciar o chat. O endpoint não retorna os registros de memória na resposta; esse teste verifica seu uso pelo contexto das respostas.

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

### Servidor MCP

O OpsPilot também pode ser iniciado como um servidor MCP local por stdio. O cliente MCP
inicia o processo e troca mensagens JSON-RPC por stdin/stdout; o stdout é reservado ao
protocolo, e diagnósticos são enviados ao stderr.

Inicie o servidor manualmente:

```sh
npm run mcp
```

Não é necessário configurar credenciais do OpenRouter para usar as ferramentas MCP. O
servidor usa o banco SQLite configurado por `OPSPILOT_DB` (padrão `./data/opspilot.db`).
Um cliente MCP pode usar esta configuração:

```json
{
  "servers": {
    "opspilot": {
      "type": "stdio",
      "command": "npm",
      "args": ["run", "--silent", "mcp"]
    }
  }
}
```

O servidor anuncia estas ferramentas:

- `list_alerts`: lista alertas; `status` aceita `firing`, `resolved` ou `all` e, se omitido, assume `firing`.
- `open_incident`: abre um incidente com `title`, `service` e `severity`. A severidade aceita `critical`, `high`, `medium`, `low` ou os aliases `sev1`–`sev4`.
- `resolve_incident`: resolve um incidente existente usando seu `id`.

As ferramentas usam as mesmas validações e a mesma store operacional das ferramentas do
OpsPilot, portanto incidentes criados ou resolvidos via MCP ficam disponíveis nas demais
interfaces que usam esse banco.

## Testes e verificação

Os testes automatizados usam dados e dependências controlados e não precisam de credenciais do OpenRouter:

```sh
npm test
npm run typecheck
```

O teste de integração do servidor MCP pode ser executado isoladamente:

```sh
node --import tsx --test src/mcp/server.test.ts
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
