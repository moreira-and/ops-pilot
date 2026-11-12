# Research: Métricas Agregadas de Solicitações

## Tokens de entrada e saída

**Decision**: Estender `ModelCallCounter` para coletar `input_tokens` e `output_tokens` de `AIMessage.usage_metadata`, com compatibilidade para `LLMResult.llmOutput.tokenUsage.promptTokens` e `completionTokens`. Propagar os valores pelas estratégias, reflexão e roteador, mantendo `promptTokens` no contrato atual e acrescentando `completionTokens`.

**Rationale**: O contador existente já recebe `LLMResult` em `handleLLMEnd`, registra chamadas por `runId` para não duplicar retries e lê tokens de prompt do `llmOutput` ou de `usage_metadata`. LangChain documenta `usage_metadata` padronizado em mensagens, e a integração OpenRouter indica suporte para uso de tokens. A coleta permanece opcional porque provedores podem não reportar ambos os valores.

**Alternatives considered**:

- Estimar tokens por caracteres ou por tokenizer local: rejeitado porque não representa necessariamente a contagem cobrada pelo provider.
- Consultar OpenRouter depois da execução: rejeitado porque o agregado deve funcionar sem chamadas externas adicionais e o campo de uso padrão atende ao fluxo atual.

Fontes: [LangChain Messages](https://docs.langchain.com/oss/javascript/langchain/messages), [LangChain ChatOpenRouter](https://docs.langchain.com/oss/javascript/integrations/chat/openrouter), [OpenRouter Usage Accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

## Custo por modelo

**Decision**: Calcular custo estimado com uma tabela local de preço por ID exato de modelo, em USD por milhão de tokens de entrada e saída. Usar `modelUsed` do registro como chave de agrupamento. Aplicar zero se o ID terminar em `:free`; custo e totais ficam indisponíveis se faltar preço ou qualquer contagem de tokens necessária.

**Rationale**: O usuário confirmou o uso de uma tabela de preços de entrada/saída e `:free=0`. O repositório não contém taxas de modelo e elas não devem ser inventadas. A tabela deve ser mantida pela aplicação; identificadores pagos não cadastrados permanecem explícitos como não precificados. A estimativa usa tokens totais da solicitação atribuídos ao seu modelo efetivo, não uma quebra por chamada individual.

**Alternatives considered**:

- Usar o campo `usage.cost` do OpenRouter: a documentação confirma que respostas do OpenRouter podem incluir custo cobrado. Não foi escolhido porque a política solicitada foi uma tabela local de preços por entrada/saída; a integração atual usa `ChatOpenAI` com base URL OpenRouter e não expõe hoje esse custo no domínio.
- Buscar a tabela de preços do OpenRouter a cada consulta: rejeitado por adicionar rede, variabilidade histórica e falhas externas a uma leitura de status.
- Tratar preço pago desconhecido como zero: rejeitado por produzir um total enganoso.

Fonte consultada: [OpenRouter Usage Accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

## Persistência e compatibilidade SQLite

**Decision**: Preservar `prompt_tokens` como a contagem de entrada e adicionar `completion_tokens` com migração aditiva após verificar `PRAGMA table_info(requests)`. Criar índice em `started_at` e consultar somente campos de status necessários, com intervalo temporal em parâmetros vinculados.

**Rationale**: Os bancos existentes foram criados com `CREATE TABLE IF NOT EXISTS`, que não acrescenta colunas a tabelas já existentes. Uma migração aditiva conserva os registros e mantém o nome de coluna associado à métrica de prompt já publicada.

**Alternatives considered**:

- Renomear `prompt_tokens` para `input_tokens`: rejeitado por exigir rebuild da tabela e arriscar compatibilidade com bancos e integrações existentes.
- Recriar ou limpar a tabela `requests`: rejeitado por perda de histórico operacional.

## Agregações e percentis

**Decision**: Buscar as solicitações iniciadas entre `from` e `to` usando SQL preparado. Calcular em serviço puro os contadores, somas, custo e agrupamentos. Calcular p50/p95 por nearest-rank, ordenando apenas latências conhecidas de registros terminais.

**Rationale**: O SQLite embarcado do projeto não tem uma extensão de percentis habilitada. Calcular nearest-rank no serviço evita dependência adicional e torna a regra determinística e testável; o filtro de data impede leitura fora da janela.

**Alternatives considered**:

- Implementar função agregada nativa em SQLite ou adicionar extensão: rejeitado por introduzir runtime/dependência adicional.
- Calcular percentis a partir de estimativas ou médias: rejeitado porque não representa p50/p95.

## Consulta HTTP e configuração

**Decision**: Validar `since` como duração positiva com `m`, `h` ou `d`, usando `24h` por padrão. Injetar a tabela de preços na criação do serviço para permitir configurações determinísticas e testes.

**Rationale**: A entrada usa a convenção explícita `24h`, e o endpoint existente é montado em `createApp`, com dependências de stores injetáveis nos testes. Entradas inválidas são falhas de validação HTTP e não devem chegar ao store.

**Alternatives considered**:

- Aceitar datas arbitrárias e múltiplas convenções simultaneamente: rejeitado por ampliar a superfície de validação sem requisito.
- Colocar preços no `.env`: rejeitado porque não são segredos e uma tabela versionada é auditável e validável.
