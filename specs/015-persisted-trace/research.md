# Research: Trace Persistido e Logs JSON

## Persistência de solicitações e eventos

**Decision**: Implementar um adaptador `SqliteRequestTraceStore` em `src/store` usando `node:sqlite` (`DatabaseSync`) e as tabelas `requests` e `trace_eventos`. Usar DDL estático idempotente, statements preparados com valores vinculados e suporte a `:memory:`. A instância de produção usa `OPSPILOT_DB`; testes injetam uma instância em memória.

**Rationale**: A Constituição exige SQLite embutido, statements preparados e bancos em memória para testes. `SqliteConversationStore` e `SqliteOpsStore` já seguem o padrão de abrir `DatabaseSync`, criar tabelas com `CREATE TABLE IF NOT EXISTS` e mapear valores persistidos por schemas. Não existe infraestrutura de migração comum para esses stores novos.

**Alternatives considered**:

- Persistir o trace no store de conversas: rejeitado porque registros operacionais de solicitações têm ciclo de vida e consulta independentes de conversas.
- Adicionar um serviço de banco externo ou ORM: rejeitado por contrariar a Constituição e acrescentar dependências desnecessárias.
- Usar tabelas com estado mutável sem sequência de evento: rejeitado porque não garante uma ordenação estável para timestamps iguais.

## Lifecycle e ordem determinística

**Decision**: O serviço registra falhas com estado `failed`; no sucesso, o nó final do grafo salva o registro com `status: "ok"` e o trace completo. A gravação de registro e eventos é atômica. Cada evento persiste sua posição como `sequence` (equivalente ao `seq` do exemplo fornecido), o nó, o tipo e o payload completo. Falhas guardam código sanitizado e valores disponíveis, sem mensagem ou stack trace.

**Rationale**: O registro ocorre no ponto em que a resposta final e suas métricas estão disponíveis, como no fluxo fornecido. O uso de uma transação previne linhas de solicitação bem-sucedidas sem todos os eventos. O estado `failed` é gravado pela borda quando a execução falha. Os eventos atuais já carregam `sequence`, `type` e `node`; a posição no trace é usada para preservar ordem, mesmo quando timestamps coincidirem.

**Alternatives considered**:

- Gravar solicitação e trace em chamadas independentes e não transacionais: rejeitado porque pode deixar registros parciais apresentados como completos.
- Ordenar apenas por `created_at`: rejeitado porque timestamps podem coincidir.
- Persistir erros completos ou mensagens de exceção: rejeitado por risco de conteúdo operacional/segredo e por não ser necessário para a consulta descrita.

## Contratos de HTTP e identificador

**Decision**: Gerar o `requestId` na borda HTTP para cada solicitação aceita para processamento, usando o padrão existente de UUID. Propagá-lo ao estado do grafo, devolvê-lo em `X-Request-Id` e no corpo de sucesso, e mantê-lo em erros posteriores à atribuição. Validar o retorno de `GET /requests/:id` com Zod; consultas sem registro retornam 404.

**Rationale**: `randomUUID` já é utilizado pelos stores SQLite. O identificador gerado pelo serviço evita colisões e mantém um único valor de correlação. O tratamento explícito de inexistência segue o padrão de erro de domínio já empregado pelas entidades.

**Alternatives considered**:

- Aceitar identificador arbitrário do cliente: rejeitado porque exige política adicional de confiança, validação e colisão.
- Retornar erros de execução sem o identificador após ele ter sido atribuído: rejeitado porque quebra correlação entre resposta, persistência e log.
- Retornar uma lista vazia para IDs inexistentes: rejeitado porque confunde inexistência com solicitação existente sem eventos.

## Logging JSON com metadados permitidos

**Decision**: Criar `src/obs/logger.ts` como fronteira de logging com campos de metadados explícitos. O nó final emite um evento `info` contendo `requestId`, `node: "resposta"`, `type: "done"`, `route` e `tokens` quando disponíveis. Cada chamada de log serializa um único objeto JSON em uma única linha; não aceitar nem serializar objetos arbitrários de trace/resultado, mensagens, respostas, argumentos de ferramentas, erros brutos ou segredos.

**Rationale**: A busca no código não encontrou logger estruturado comum. O código existente usa `console` para alguns eventos de operação, mas não define um contrato de logging. Uma superfície pequena e permitida impede que o logger replique acidentalmente conteúdo de trace ou de requisição.

**Alternatives considered**:

- Serializar diretamente o evento ou resultado completo: rejeitado porque inclui conteúdo operacional.
- Adicionar biblioteca de logging: rejeitado porque a feature precisa apenas de uma linha JSON e não há requisito de rotação, transporte ou agregação externa.
- Redigir campos sensíveis de um objeto arbitrário: rejeitado em favor de uma allowlist de metadados, menos propensa a deixar passar novos campos sensíveis.

## Testes e isolamento

**Decision**: Cobrir persistência e ordenação com `DatabaseSync(":memory:")`, logger por sink de escrita injetável e rotas com a fábrica Express existente, store em memória e estratégia fake. Executar `npm run typecheck` e `npm test`.

**Rationale**: `node:test` via `tsx` é o padrão do projeto e `src/http/server.test.ts` já cria servidor local efêmero e usa estratégias fake. Isso valida os contratos sem OpenRouter, chamadas de rede a serviços de agente ou acesso ao banco de produção.

**Alternatives considered**:

- Testar contra o banco persistente padrão: rejeitado por risco de contaminação entre execuções e falta de determinismo.
- Fazer testes HTTP dependerem de um provedor real: rejeitado porque não testa isoladamente o contrato e exige credenciais/rede.
