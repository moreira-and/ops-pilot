# Feature Specification: Trace Persistido e Logs JSON

**Feature Branch**: `[015-persisted-trace]`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "Trace persistido + logs JSON: /chat requestId no corpo e no header X-Request-Id; SQLite: requests (metricas) e trace_eventos (node, payloads); src/obs/logger.ts: 1 linha JSON por evento, só metadados; GET /requests/:id registro + trace ordenado."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correlacionar uma solicitação de chat (Priority: P1)

Como operador de plantão, quero receber um identificador único para cada solicitação de chat e encontrá-lo tanto na resposta quanto no cabeçalho HTTP, para correlacionar a interação com seus registros operacionais.

**Why this priority**: Sem um identificador comum, é difícil localizar e investigar uma execução específica.

**Independent Test**: Enviar uma solicitação válida a `/chat` e comparar o identificador no corpo da resposta com o valor do cabeçalho `X-Request-Id`.

**Acceptance Scenarios**:

1. **Given** uma solicitação válida a `/chat`, **When** o serviço responde, **Then** o corpo inclui `requestId` e o cabeçalho `X-Request-Id` contém exatamente o mesmo valor.
2. **Given** duas solicitações distintas, **When** ambas recebem resposta, **Then** cada uma tem um identificador que permite consultar seu próprio registro sem confundi-lo com o da outra.

### User Story 2 - Consultar registro e trace de uma execução (Priority: P1)

Como operador de plantão, quero consultar uma solicitação pelo identificador e receber suas métricas junto dos eventos do trace em ordem, para entender o que ocorreu durante a execução.

**Why this priority**: A correlação só é útil se os detalhes operacionais persistirem e puderem ser recuperados de forma previsível.

**Independent Test**: Executar uma solicitação que produza vários eventos, consultar `/requests/:id` e verificar o registro, as métricas e a sequência cronológica dos eventos.

**Acceptance Scenarios**:

1. **Given** uma solicitação processada e persistida, **When** um operador consulta `/requests/:id` usando seu `requestId`, **Then** recebe o registro da solicitação, suas métricas e os eventos do trace em ordem cronológica.
2. **Given** um identificador sem registro correspondente, **When** um operador consulta `/requests/:id`, **Then** recebe uma resposta de não encontrado, sem um registro inventado ou trace de outra solicitação.
3. **Given** um trace com dois eventos no mesmo instante, **When** o serviço retorna os eventos, **Then** sua ordem permanece determinística e consistente com a ordem em que foram registrados.

### User Story 3 - Investigar eventos sem expor conteúdo operacional (Priority: P2)

Como operador, quero que cada evento seja registrado em formato estruturado e com metadados suficientes para correlação, sem incluir conteúdo de mensagens, respostas ou outros payloads, para pesquisar eventos sem expor dados operacionais nos logs.

**Why this priority**: Logs estruturados simplificam a investigação, e limitar seu conteúdo reduz a exposição desnecessária de dados.

**Independent Test**: Produzir eventos que contenham metadados e payloads e verificar que cada evento gera uma linha JSON válida com metadados, sem os valores dos payloads.

**Acceptance Scenarios**:

1. **Given** um evento processado, **When** o logger o registra, **Then** emite uma única linha JSON correspondente ao evento.
2. **Given** um evento com mensagem, resposta ou payload operacional, **When** o logger o registra, **Then** a linha contém somente metadados e não contém esses conteúdos nem segredos.
3. **Given** eventos associados a uma solicitação, **When** um operador correlaciona logs com o registro consultado, **Then** os metadados permitem identificar o `requestId` relacionado.

### Edge Cases

- Uma solicitação inválida ou rejeitada antes do processamento não deve receber um registro de sucesso; caso tenha sido atribuída a ela um identificador, erros e logs devem manter a mesma correlação.
- Uma falha durante o processamento deve preservar os eventos e métricas disponíveis para a solicitação, sem ser apresentada como execução bem-sucedida.
- Se a persistência não puder ser concluída, o serviço deve comunicar a falha explicitamente e não afirmar que o trace foi persistido.
- Identificadores desconhecidos ou malformados não devem retornar dados de outras solicitações.
- Payloads do trace podem conter conteúdo operacional; eles são persistidos no trace solicitado, mas não devem ser copiados para os logs JSON.
- Eventos simultâneos devem manter uma ordenação estável, mesmo quando seus horários registrados forem iguais.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Para cada solicitação processada por `POST /chat`, o sistema MUST atribuir um `requestId` que identifique unicamente aquela solicitação.
- **FR-002**: O sistema MUST incluir o mesmo `requestId` no corpo da resposta de `/chat` e no cabeçalho `X-Request-Id`.
- **FR-003**: O sistema MUST persistir em `requests` o identificador, `userId`, rota escolhida, modelo usado, tokens de prompt, latência e status da execução.
- **FR-004**: O sistema MUST persistir cada evento do trace em `trace_eventos`, associado à solicitação, incluindo `seq`, `node`, `type` e o evento completo em `payload`.
- **FR-005**: O sistema MUST manter a associação entre cada evento e seu registro de solicitação, sem misturar dados de identificadores diferentes.
- **FR-006**: O sistema MUST disponibilizar `GET /requests/:id` para retornar o registro da solicitação identificado por `id`, suas métricas e o trace correspondente.
- **FR-007**: A resposta de `GET /requests/:id` MUST apresentar os eventos na ordem em que ocorreram; quando seus horários coincidirem, MUST preservar uma ordem determinística de registro.
- **FR-008**: Quando `GET /requests/:id` receber um identificador sem registro correspondente, o sistema MUST responder como não encontrado e não MUST retornar dados de outra solicitação.
- **FR-009**: O logger em `src/obs/logger.ts` MUST emitir exatamente uma linha JSON por evento.
- **FR-010**: Cada linha produzida pelo logger MUST conter apenas metadados necessários à observabilidade, incluindo o `requestId` quando disponível, e MUST NOT incluir mensagens, respostas, payloads operacionais ou segredos.
- **FR-011**: Falhas de processamento ou persistência MUST ser representadas explicitamente e não MUST ser reportadas como sucesso com persistência concluída.

### Key Entities *(include if feature involves data)*

- **Solicitação (`requests`)**: Uma execução de `/chat` identificada por ID, com `userId`, rota, modelo usado, tokens de prompt, latência e status `ok` ou `failed`.
- **Evento de trace (`trace_eventos`)**: Um evento vinculado à solicitação por `requestId`, com sequência, nó, tipo e payload completo.
- **Evento de log**: Uma ocorrência operacional serializada como uma linha JSON contendo metadados, sem conteúdo de payload.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das respostas de `/chat` a solicitações processadas, o `requestId` do corpo é idêntico ao valor de `X-Request-Id`.
- **SC-002**: Em 100% das solicitações cuja execução conclui a persistência, a consulta pelo identificador retorna o registro e as métricas dessa mesma solicitação.
- **SC-003**: Em 100% dos traces consultados, os eventos são devolvidos em ordem de registro, inclusive quando eventos compartilham o mesmo horário.
- **SC-004**: 100% dos eventos registrados pelo logger correspondem a uma linha JSON válida, sem conteúdo de mensagem, resposta, payload operacional ou segredo.
- **SC-005**: Uma consulta por identificador inexistente nunca retorna dados de outra solicitação e informa que o registro não foi encontrado.
- **SC-006**: Operadores conseguem correlacionar uma resposta de chat, seu registro e os eventos correspondentes usando um único identificador.

## Assumptions

- O `requestId` é gerado pelo serviço para cada solicitação processada; clientes não escolhem nem reutilizam identificadores nesta versão.
- O sucesso é persistido com `status: "ok"` no nó final, quando a rota e as métricas finais estão disponíveis; falhas usam `status: "failed"` e preservam os dados disponíveis.
- A ordem de eventos usa a sequência de registro como desempate quando timestamps forem iguais.
- Payloads pertencem aos registros de trace persistidos e não são considerados metadados seguros para logging.
- Identificadores sem registro correspondente são tratados como não encontrado (HTTP 404).
- A persistência de traces é parte do resultado operacional esperado; uma falha que impeça sua conclusão deve ser reportada explicitamente.
