# Feature Specification: Persistent Conversations

**Feature Branch**: `007-conversation-persistence`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "Adicionar conversas persistentes ao chat, com identificador opcional devolvido na resposta, inclusão das 12 mensagens anteriores no contexto e métrica da quantidade de mensagens do histórico."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retomar uma conversa (Priority: P1)

Quem usa o OpsPilot pode enviar uma nova mensagem com o identificador de uma conversa anterior e receber uma resposta que considere o contexto recente. Isso evita que a pessoa precise repetir informações importantes ao continuar uma investigação.

**Why this priority**: Manter o contexto entre interações é o valor central da conversa persistente.

**Independent Test**: Enviar uma mensagem, guardar o identificador retornado e enviar outra mensagem com esse identificador; verificar que o contexto anterior está disponível para a segunda resposta.

**Acceptance Scenarios**:

1. **Given** uma conversa existente com mensagens anteriores, **When** a pessoa envia uma mensagem com seu identificador, **Then** a resposta continua a mesma conversa e considera as mensagens recentes anteriores.
2. **Given** uma conversa com mais de 12 mensagens anteriores, **When** a pessoa continua a conversa, **Then** somente as 12 mensagens mais recentes são consideradas como histórico e elas mantêm sua ordem cronológica.
3. **Given** uma conversa existente, **When** a troca de mensagens é concluída, **Then** as mensagens da pessoa e do assistente ficam disponíveis para uma solicitação posterior na mesma conversa.

### User Story 2 - Iniciar uma conversa (Priority: P1)

Quem conversa com o OpsPilot pode iniciar uma conversa sem fornecer um identificador. O sistema cria uma conversa e devolve um identificador que pode ser usado para continuar depois.

**Why this priority**: Conversas retomáveis precisam começar sem exigir que a pessoa obtenha previamente um identificador.

**Independent Test**: Enviar uma solicitação de chat sem identificador; verificar que a resposta contém um identificador utilizável e que a conversa começa sem histórico anterior.

**Acceptance Scenarios**:

1. **Given** uma solicitação de chat sem identificador de conversa, **When** ela é processada, **Then** uma nova conversa é criada e seu identificador é devolvido na resposta.
2. **Given** duas solicitações independentes sem identificador, **When** ambas são processadas, **Then** cada uma recebe um identificador de conversa diferente.

### User Story 3 - Verificar o uso do histórico (Priority: P2)

Quem acompanha o processamento do chat pode verificar quantas mensagens anteriores foram usadas como contexto na resposta.

**Why this priority**: Uma contagem consistente permite entender e validar a composição do contexto sem alterar o fluxo de conversa.

**Independent Test**: Enviar solicitações com zero, menos de 12 e mais de 12 mensagens anteriores; conferir que a métrica corresponde ao histórico efetivamente considerado.

**Acceptance Scenarios**:

1. **Given** uma conversa sem mensagens anteriores, **When** a primeira solicitação é processada, **Then** `historyMessages` indica zero.
2. **Given** uma conversa com até 12 mensagens anteriores, **When** uma solicitação é processada, **Then** `historyMessages` indica a quantidade dessas mensagens incluídas no contexto.
3. **Given** uma conversa com mais de 12 mensagens anteriores, **When** uma solicitação é processada, **Then** `historyMessages` indica 12.

### Edge Cases

- Um identificador fornecido que não corresponde a uma conversa existente deve resultar em erro explícito; o sistema não deve criar silenciosamente uma conversa diferente.
- Conversas com menos de 12 mensagens anteriores devem incluir apenas as mensagens disponíveis.
- A seleção das mensagens mais recentes deve preservar a ordem cronológica no contexto enviado.
- Se a persistência de uma conversa falhar, o sistema não deve retornar uma resposta que aparente ter sido salva com sucesso.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir iniciar uma conversa de chat sem fornecer `conversationId`.
- **FR-002**: Ao iniciar uma conversa, o sistema MUST criar um identificador de conversa e devolvê-lo na resposta do chat.
- **FR-003**: O sistema MUST aceitar um `conversationId` existente para associar uma nova solicitação à conversa correspondente.
- **FR-004**: O sistema MUST rejeitar explicitamente um `conversationId` que não corresponda a uma conversa existente.
- **FR-005**: O sistema MUST preservar as mensagens de cada conversa entre solicitações, incluindo as mensagens da pessoa e as respostas do assistente de trocas concluídas.
- **FR-006**: Para compor o contexto de uma solicitação, o sistema MUST incluir no máximo as 12 mensagens anteriores mais recentes da conversa, em ordem cronológica.
- **FR-007**: O sistema MUST disponibilizar a métrica `historyMessages` com a quantidade de mensagens anteriores efetivamente incluídas no contexto, de zero a 12.
- **FR-008**: Falhas ao salvar mensagens ou conversas MUST ser comunicadas como falhas, sem resposta indicando persistência bem-sucedida.

### Key Entities

- **Conversa**: Agrupa uma sequência persistente de mensagens e é identificada por um identificador devolvido ao iniciar o chat.
- **Mensagem**: Uma entrada de uma conversa, com conteúdo, papel do emissor e posição temporal ou sequencial que permite recuperar as mensagens recentes em ordem.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Todas as solicitações subsequentes enviadas com um identificador válido são associadas ao histórico da conversa correspondente.
- **SC-002**: Para históricos de zero, 1, 12 e mais de 12 mensagens, a solicitação considera exatamente `min(total de mensagens anteriores, 12)` mensagens em ordem cronológica, e `historyMessages` corresponde a essa quantidade.
- **SC-003**: Todo início de conversa sem identificador devolve um identificador não vazio e distinto dos identificadores de outras conversas.
- **SC-004**: Falhas de persistência são visíveis como erros e nunca são contabilizadas como uma conversa salva com sucesso.

## Assumptions

- `conversationId` é um identificador opaco gerado pelo sistema; o cliente o devolve para continuar uma conversa.
- O limite de 12 se aplica a mensagens individuais anteriores (por exemplo, mensagens da pessoa e do assistente contam separadamente), não a 12 turnos completos.
- `historyMessages` conta somente mensagens anteriores recuperadas para o contexto da solicitação atual, sem incluir a mensagem atual nem a resposta que ainda será gerada.
- Mensagens de trocas concluídas são persistidas para uso em solicitações posteriores; retenção, exclusão e compartilhamento de conversas não fazem parte deste escopo.
