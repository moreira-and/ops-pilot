# Feature Specification: Persistência Operacional

**Feature Branch**: `004-operational-persistence`

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "Adicionar persistência real às operações do OpsPilot, mantendo os dados operacionais após reinícios, inicializando um cenário Mercadinho repetível e permitindo consultar alertas, incidentes e runbooks pelas ferramentas do agente."

## User Scenarios & Testing

### User Story 1 - Preservar o estado operacional (Priority: P1)

Como operador de plantão, quero que serviços, alertas, incidentes e runbooks permaneçam
disponíveis após reiniciar o OpsPilot, para continuar o trabalho sem perder o estado registrado.

**Why this priority**: Sem persistência, incidentes criados ou resolvidos se perdem e o agente não
consegue apoiar operações contínuas.

**Independent Test**: Inicializar o armazenamento com dados conhecidos, criar e resolver um
incidente, reiniciar a aplicação e verificar que os registros e seus estados continuam disponíveis.

**Acceptance Scenarios**:

1. **Given** dados operacionais já registrados, **When** o OpsPilot é encerrado e iniciado
   novamente, **Then** os serviços, alertas e incidentes existentes continuam disponíveis.
2. **Given** um novo armazenamento sem estrutura inicial, **When** o OpsPilot inicia, **Then** a
   estrutura necessária fica pronta sem exigir uma etapa manual de preparação.
3. **Given** um incidente aberto, **When** ele é resolvido e o armazenamento é reaberto,
   **Then** seu estado resolvido, horário de resolução e resumo permanecem associados ao incidente.

### User Story 2 - Iniciar um cenário de demonstração reproduzível (Priority: P1)

Como operador ou responsável por benchmark, quero iniciar o OpsPilot com um cenário Mercadinho
conhecido e repetível, para testar as ferramentas em condições previsíveis sem duplicar dados a
cada inicialização.

**Why this priority**: Dados iniciais estáveis tornam os testes, demonstrações e comparações de
estratégias consistentes.

**Independent Test**: Inicializar o cenário mais de uma vez e conferir que permanecem cinco
serviços, seis alertas (três disparando e três resolvidos) e os três runbooks esperados, sem
duplicações.

**Acceptance Scenarios**:

1. **Given** o cenário ainda não foi carregado, **When** o OpsPilot inicia, **Then** ficam
   disponíveis cinco serviços e seis alertas, com três alertas em cada estado `firing` e
   `resolved`.
2. **Given** o cenário já foi carregado, **When** ele é carregado novamente, **Then** não são
   criadas cópias dos registros nem removidos incidentes criados durante operações anteriores.
3. **Given** o cenário inicializado, **When** o agente consulta procedimentos, **Then** há um
   runbook para cada serviço `checkout`, `payments` e `auth`.
4. **Given** um benchmark ou teste isolado, **When** ele inicia o cenário, **Then** suas alterações
   não contaminam execuções isoladas subsequentes.

### User Story 3 - Consultar e operar incidentes com o agente (Priority: P1)

Como operador de plantão, quero abrir, listar e resolver incidentes pelo agente, para registrar
uma situação, acompanhar sua evolução e retomar o trabalho após reinícios.

**Why this priority**: A gestão de incidentes é a principal operação mutável e precisa de estado
durável e previsível.

**Independent Test**: Abrir um incidente para um serviço conhecido, listar incidentes por estado,
resolvê-lo e verificar tanto as transições quanto os dados após reabrir o armazenamento.

**Acceptance Scenarios**:

1. **Given** um serviço conhecido e dados válidos, **When** o operador solicita a abertura de um
   incidente, **Then** o sistema registra o incidente como `open`, com resumo e horário de
   resolução inicialmente nulos.
2. **Given** incidentes abertos e resolvidos, **When** o agente lista incidentes com `open`,
   `resolved` ou `all`, **Then** retorna somente os registros correspondentes ao filtro.
3. **Given** o agente lista incidentes sem informar estado, **When** a consulta é executada,
   **Then** o resultado contém apenas incidentes abertos.
4. **Given** um incidente aberto conhecido, **When** o operador solicita sua resolução,
   **Then** o sistema o marca `resolved` e registra seu horário de resolução.
5. **Given** um incidente inexistente, **When** o operador solicita sua resolução, **Then** o
   sistema informa a falha e não apresenta a operação como bem-sucedida.

### User Story 4 - Consultar alertas e procedimentos (Priority: P2)

Como operador de plantão, quero consultar alertas e o runbook de um serviço pelo agente, para
investigar sinais ativos e seguir orientações específicas sem inventar procedimentos.

**Why this priority**: A consulta complementa a gestão de incidentes com contexto sobre o estado
atual e as ações recomendadas para cada serviço.

**Independent Test**: Consultar alertas por estado e pedir o runbook de cada serviço com
procedimento, verificando os resultados e o tratamento de serviços sem runbook.

**Acceptance Scenarios**:

1. **Given** alertas em ambos os estados, **When** o agente lista `firing`, `resolved` ou `all`,
   **Then** recebe os alertas do estado solicitado; sem estado informado, recebe alertas
   `firing`.
2. **Given** um serviço que possui runbook, **When** o agente consulta o procedimento desse
   serviço, **Then** recebe o runbook associado ao serviço solicitado.
3. **Given** um serviço desconhecido ou sem runbook, **When** o agente consulta o procedimento,
   **Then** recebe uma indicação explícita de que o procedimento não está disponível.

### Edge Cases

- Uma execução repetida de carga inicial não duplica dados nem apaga incidentes registrados.
- Um incidente sem resumo ou ainda não resolvido mantém `summary` e `resolved_at` nulos.
- Um incidente já resolvido não deve voltar ao estado aberto ao ser listado ou ao reiniciar o
  OpsPilot.
- Estados, severidades e demais campos de domínio com opções fechadas rejeitam valores fora do
  conjunto permitido.
- Não é possível abrir incidente para serviço inexistente.
- Serviço sem runbook e serviço desconhecido são tratados como ausência explícita de procedimento,
  sem retorno de um runbook de outro serviço.
- Uma falha de leitura ou gravação é comunicada como falha; não é convertida em uma resposta vazia
  ou em confirmação de sucesso.
- O cenário isolado de teste/benchmark pode ser descartado sem alterar a base operacional
  persistente.

## Requirements

### Functional Requirements

- **FR-001**: O sistema MUST preservar os dados operacionais após reinícios, incluindo serviços,
  alertas, incidentes e runbooks.
- **FR-002**: O sistema MUST preparar automaticamente a estrutura de persistência necessária na
  inicialização sem destruir dados existentes.
- **FR-003**: O sistema MUST fornecer um cenário inicial Mercadinho com exatamente cinco
  serviços, seis alertas (três `firing` e três `resolved`) e runbooks para `checkout`, `payments`
  e `auth`.
- **FR-004**: A carga do cenário MUST ser idempotente: repeti-la não cria duplicatas nem remove
  incidentes operacionais criados após a carga inicial.
- **FR-005**: O sistema MUST permitir execuções de teste e benchmark com dados isolados e
  reproduzíveis, sem efeitos sobre os dados persistentes usados pela aplicação.
- **FR-006**: O sistema MUST permitir a abertura de incidentes para serviços conhecidos e manter
  os campos `summary` e `resolved_at` nulos enquanto não houver valores correspondentes.
- **FR-007**: O sistema MUST permitir listar incidentes por `open`, `resolved` e `all`; a omissão
  do filtro MUST equivaler a `open`.
- **FR-008**: O sistema MUST permitir resolver incidentes existentes, registrando o estado
  `resolved` e o horário de resolução, e MUST informar quando o incidente não existe.
- **FR-009**: O sistema MUST permitir consultar alertas por `firing`, `resolved` e `all`; a
  omissão do filtro MUST equivaler a `firing`.
- **FR-010**: O sistema MUST permitir consultar o runbook correspondente a um serviço e informar
  explicitamente quando o serviço ou procedimento não estiver disponível.
- **FR-011**: Os valores de estado e severidade MUST pertencer aos conjuntos fechados do domínio;
  qualquer valor fora desses conjuntos MUST ser rejeitado.
- **FR-012**: Todas as ferramentas operacionais MUST descrever claramente seu propósito e uso ao
  agente conforme os seis critérios abaixo:
  1. Informar o propósito e o resultado esperado da ferramenta.
  2. Explicar quando a ferramenta deve ser usada.
  3. Explicar quando não deve ser usada, incluindo que `open_incident` só registra um problema
     confirmado para acompanhamento formal ou atende a um pedido explícito de abertura; não deve
     ser acionada apenas para resumir ou investigar alertas.
  4. Descrever cada campo de entrada, seu significado e se é obrigatório ou opcional.
  5. Explicitar estados, severidades, aliases e valores padrão aceitos, sem deixar enums ambíguos.
  6. Orientar o agente a usar identificadores e informações conhecidos, tratar falhas
     explicitamente e não afirmar que uma operação foi concluída sem confirmação.
- **FR-013**: A ferramenta `list_incidents` MUST aceitar `status` igual a `open`, `resolved` ou
  `all`, usando `open` como padrão.
- **FR-014**: A ferramenta `consultar_runbook` MUST receber o serviço solicitado e devolver apenas
  o procedimento associado a esse serviço.
- **FR-015**: A implementação MUST preservar o comportamento observável das ferramentas
  operacionais existentes, incluindo filtros de alertas, abertura e resolução de incidentes.

### Key Entities

- **Serviço**: Serviço operacional conhecido pelo OpsPilot e associado a alertas, incidentes e,
  quando disponível, um runbook.
- **Alerta**: Sinal de monitoramento ligado a um serviço, com título, severidade, estado e
  horários de criação e atualização.
- **Incidente**: Registro de trabalho operacional ligado a um serviço, com título, severidade,
  estado, resumo opcional, horário de resolução opcional e horários de criação e atualização.
- **Runbook**: Procedimento operacional associado a um serviço para orientar investigação ou
  mitigação.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% dos serviços, alertas e incidentes existentes antes de um reinício continuam
  consultáveis após a retomada.
- **SC-002**: Duas ou mais cargas consecutivas do cenário inicial resultam exatamente em cinco
  serviços e seis alertas, distribuídos em três alertas `firing` e três `resolved`, sem
  duplicações e com os três runbooks previstos.
- **SC-003**: 100% das consultas de incidente com os filtros `open`, `resolved`, `all` ou omitido
  retornam apenas os estados correspondentes às regras definidas.
- **SC-004**: 100% das operações com estado ou severidade fora do conjunto permitido são rejeitadas
  sem alterar os registros existentes.
- **SC-005**: Todas as seis regras de descrição das ferramentas podem ser verificadas para cada
  ferramenta operacional.
- **SC-006**: Uma execução isolada de teste ou benchmark pode ser repetida com o mesmo conjunto
  inicial de dados e não altera os registros da aplicação persistente.

## Assumptions

- Os cinco serviços do cenário incluem `checkout`, `payments` e `auth`, pois cada um tem um
  runbook requerido; os demais serviços preservam nomes pertinentes ao cenário de demonstração
  existente.
- `critical`, `high`, `medium` e `low` são as severidades canônicas; `sev1`, `sev2`, `sev3` e
  `sev4` são aliases correspondentes, respectivamente.
- O cenário inicial deve ser carregado automaticamente ao iniciar uma base nova e não deve
  sobrescrever estado operacional criado por usuários em inicializações seguintes.
- A consulta a um runbook não executa automaticamente os passos descritos nele.
- Em caso de solicitação para abrir incidente, o agente deve se apoiar em informações confirmadas
  pelo usuário ou por investigação já realizada; não deve inferir um problema ou fabricar dados.
- A persistência segue as restrições de arquitetura e segurança definidas na constitution do
  projeto; esta especificação descreve os resultados funcionais e observáveis.
