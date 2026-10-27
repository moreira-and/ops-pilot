# Feature Specification: Grafo unificado de produção

**Feature Branch**: `[013-unified-production-graph]`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Grafo unificado:
- production-graph.ts: nós contexto, roteador, as 3 estratégias com nós e resposta.
- Roteador: withStructuredOutput (route, reason); tabela no prompt; evento "route" e campo node em todo evento de trace.
- /chat: strategy opcional (se vier, é override no trace)"

## User Scenarios & Testing

### User Story 1 - Receber uma resposta pela estratégia adequada (Priority: P1)

Como operador de plantão, quero enviar uma pergunta e receber uma resposta produzida por uma das estratégias de raciocínio disponíveis, para que o OpsPilot escolha um fluxo apropriado sem exigir que eu conheça sua configuração interna.

**Why this priority**: A seleção automática e a execução integrada das estratégias são o objetivo central do grafo unificado.

**Independent Test**: Enviar uma solicitação sem estratégia explícita, fornecer contexto e respostas determinísticas para cada estratégia, e verificar que uma única rota é selecionada e uma resposta é retornada.

**Acceptance Scenarios**:

1. **Given** uma solicitação válida sem estratégia escolhida pelo cliente, **When** o OpsPilot processa a solicitação, **Then** prepara o contexto, seleciona uma estratégia disponível e retorna a resposta dessa execução.
2. **Given** uma decisão de roteamento válida, **When** a estratégia selecionada termina, **Then** a resposta final e o trace pertencem à mesma execução e correspondem à rota escolhida.
3. **Given** uma falha ao determinar uma rota ou executar a estratégia, **When** a solicitação termina, **Then** a falha é comunicada como falha e não como resposta bem-sucedida.

### User Story 2 - Entender o caminho até a resposta (Priority: P1)

Como operador que investiga a resposta, quero consultar no trace qual estratégia foi escolhida, por qual razão e em qual nó cada evento ocorreu, para compreender o fluxo executado sem recorrer a logs separados.

**Why this priority**: A trilha uniforme torna a seleção e execução auditáveis e permite correlacionar os eventos com o grafo.

**Independent Test**: Executar cada caminho de estratégia com componentes determinísticos e verificar a presença do evento de rota, de sua justificativa e do identificador de nó em todos os eventos do trace.

**Acceptance Scenarios**:

1. **Given** uma execução com roteamento automático, **When** o roteador escolhe uma estratégia, **Then** o trace contém um evento `route` que identifica a estratégia selecionada e a razão da decisão.
2. **Given** qualquer evento produzido em qualquer nó, **When** o trace é retornado, **Then** esse evento contém o campo `node` identificando o nó que o produziu.
3. **Given** uma execução concluída, **When** o cliente inspeciona o trace, **Then** os eventos de contexto, roteamento, estratégia e resposta aparecem na ordem em que ocorreram.

### User Story 3 - Sobrescrever a seleção automática no chat (Priority: P2)

Como cliente do chat, quero poder informar uma estratégia opcional para substituir a seleção automática, para controlar o fluxo quando meu caso de uso exigir uma estratégia específica.

**Why this priority**: A escolha explícita preserva o controle do cliente sem retirar o roteamento automático como comportamento padrão.

**Independent Test**: Enviar uma estratégia válida pelo chat e verificar que somente ela é executada e que o evento de rota registra a escolha explícita como override.

**Acceptance Scenarios**:

1. **Given** uma solicitação válida com uma estratégia suportada, **When** o chat a processa, **Then** a estratégia informada é executada em vez de consultar a seleção automática.
2. **Given** uma solicitação com estratégia explícita, **When** o trace é retornado, **Then** o evento `route` identifica a estratégia escolhida e indica que a decisão veio de um override do cliente.
3. **Given** uma solicitação com estratégia desconhecida, **When** o chat valida a entrada, **Then** rejeita a solicitação conforme o comportamento de erro já definido para estratégias desconhecidas e não inicia uma execução.

### Edge Cases

- O roteador retorna uma estratégia fora das opções suportadas ou uma decisão sem justificativa; a solicitação falha explicitamente sem escolher uma alternativa silenciosa.
- A estratégia indicada pelo cliente é desconhecida; a solicitação é rejeitada antes de executar qualquer nó de estratégia.
- Um nó falha após alguns eventos já terem sido produzidos; a falha não é apresentada como resposta de sucesso e os eventos existentes permanecem associados aos seus nós.
- Um trace vazio ou incompleto não deve ser apresentado como uma execução completa bem-sucedida.
- O cliente omite `strategy`; o roteador automático permanece responsável pela seleção.

## Requirements

### Functional Requirements

- **FR-001**: O sistema MUST processar uma solicitação operacional por um fluxo unificado que prepare contexto, selecione uma rota, execute a estratégia correspondente e produza uma resposta final.
- **FR-002**: O roteador MUST escolher entre `react`, `plan-and-execute` e `reflect:react` usando uma tabela de decisão e MUST produzir a rota escolhida e uma razão legível para a escolha.
- **FR-003**: O trace MUST conter um evento `route` com a rota escolhida e a razão da decisão, tanto para seleção automática quanto para uma estratégia explicitamente escolhida pelo cliente.
- **FR-004**: Todo evento de trace MUST conter `node`, identificando o nó do grafo que produziu o evento.
- **FR-005**: O fluxo MUST preparar contexto antes da seleção automática e disponibilizar esse contexto à estratégia selecionada.
- **FR-006**: O endpoint `/chat` MUST aceitar `strategy` como campo opcional. Quando omitido, a seleção MUST ser automática; quando presente e válido, MUST substituir a seleção automática.
- **FR-007**: Quando `strategy` for fornecida, o trace MUST deixar explícito que a rota foi escolhida pelo override do cliente.
- **FR-008**: O sistema MUST rejeitar uma estratégia explícita desconhecida antes de executar uma estratégia e MUST preservar o formato de erro já estabelecido para essa condição.
- **FR-009**: Uma execução concluída com sucesso MUST retornar a resposta da estratégia selecionada junto com o trace completo e as métricas correspondentes à execução.
- **FR-010**: Falhas de roteamento ou de execução MUST ser reportadas como falhas; o sistema MUST NOT selecionar silenciosamente outra estratégia nem apresentar uma falha como resposta bem-sucedida.

### Key Entities

- **Contexto da execução**: Informações operacionais preparadas para orientar a escolha de rota e a estratégia executada.
- **Decisão de rota**: Estratégia selecionada e razão associada, com indicação de seleção automática ou override explícito.
- **Evento de trace**: Registro ordenado de uma ocorrência do grafo, incluindo seu tipo e o nó que a produziu.
- **Resultado do chat**: Resposta final da estratégia selecionada, acompanhada do trace e das métricas da execução.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Em 100% dos testes de solicitações válidas sem `strategy`, o fluxo escolhe exatamente uma das três estratégias suportadas e retorna o resultado dessa execução.
- **SC-002**: Em 100% dos traces retornados, existe um evento `route` com rota e razão, e todo evento contém o campo `node`.
- **SC-003**: Em 100% dos testes com uma estratégia explícita válida, a estratégia indicada é executada, a seleção automática não inicia outra estratégia e o override é identificável no trace.
- **SC-004**: Em 100% dos casos de estratégia explícita desconhecida ou falha de execução, o cliente recebe uma falha explícita, nunca uma resposta de sucesso fabricada.
- **SC-005**: Um operador que consulte apenas o trace consegue identificar a estratégia executada, se ela foi escolhida automaticamente ou por override e a razão da decisão.

## Assumptions

- A alteração mantém o contrato de sucesso existente do chat, incluindo resposta, trace e métricas; esta especificação não amplia o formato das métricas.
- Uma estratégia explicitamente informada deve corresponder a uma das opções suportadas; os erros existentes para estratégia desconhecida permanecem aplicáveis.
- O contexto usado pelo roteador e pelas estratégias é o contexto já disponível ao fluxo de produção; a especificação não define novas fontes de dados.
- `reflect:react` é a estratégia ReAct com a camada Reflection existente; as outras duas rotas correspondem às estratégias-base existentes.
