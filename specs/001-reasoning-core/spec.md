# Feature Specification: Núcleo de raciocínio do OpsPilot

**Feature Branch**: `[001-reasoning-core]`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "Núcleo de raciocínio do OpsPilot, com estratégias ReAct e Plan-and-Execute, ferramentas operacionais para alertas e incidentes, uma arena de comparação, métricas e dados de demonstração."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Investigar alertas e incidentes (Priority: P1)

Como pessoa de plantão, quero que o OpsPilot investigue um pedido operacional usando alertas e incidentes disponíveis, para obter uma resposta fundamentada em dados atuais e ações realizadas.

**Why this priority**: A investigação operacional é a capacidade central do copiloto e deve funcionar antes de ser possível comparar estratégias.

**Independent Test**: Executar uma estratégia com uma pergunta sobre alertas e verificar que a resposta corresponde aos dados disponíveis e que as operações solicitadas são realizadas ou reportadas como indisponíveis.

**Acceptance Scenarios**:

1. **Given** alertas ativos e resolvidos no conjunto de demonstração, **When** a pessoa solicita alertas por status, **Then** a estratégia retorna apenas alertas que correspondem ao status solicitado.
2. **Given** uma solicitação válida para abrir ou resolver um incidente, **When** a estratégia executa a operação, **Then** o incidente é criado ou atualizado e o resultado é incluído na resposta.
3. **Given** argumentos de ferramenta inválidos ou uma referência inexistente, **When** a operação é solicitada, **Then** o sistema reporta a falha sem indicar que a operação foi concluída.

### User Story 2 - Entender como a estratégia chegou à resposta (Priority: P2)

Como pessoa de plantão, quero consultar uma trilha tipada das etapas de raciocínio e o custo de execução, para entender quais observações e ações sustentam a resposta.

**Why this priority**: Uma trilha legível e métricas tornam as decisões auditáveis e permitem detectar execuções incompletas ou excessivas.

**Independent Test**: Executar cada estratégia com um provedor controlado e verificar que a saída contém resposta, eventos tipados em ordem e métricas de chamadas ao modelo e latência.

**Acceptance Scenarios**:

1. **Given** uma execução que consulta uma ferramenta, **When** a execução termina, **Then** a trilha contém eventos de ação e observação com ferramenta e argumentos identificáveis.
2. **Given** uma execução limitada por iterações, **When** o limite é atingido, **Then** a execução termina dentro do limite e informa sua resposta, trilha e número de chamadas ao modelo.
3. **Given** texto ou valores que exijam formatação de trilha, **When** a saída é formatada, **Then** os eventos permanecem distinguíveis pelos tipos definidos e são apresentados na ordem de ocorrência.

### User Story 3 - Comparar estratégias na arena (Priority: P3)

Como pessoa desenvolvedora ou operadora, quero executar uma ou mais estratégias sobre a mesma entrada e controlar o limite de iterações, para comparar respostas, rastros e métricas em condições equivalentes.

**Why this priority**: A comparação é útil depois que as estratégias e seus resultados individuais são confiáveis.

**Independent Test**: Executar a arena com uma entrada fixa e duas estratégias, verificando que ambas recebem a mesma entrada e que os resultados incluem trilhas e métricas separadas.

**Acceptance Scenarios**:

1. **Given** uma ou mais estratégias válidas e uma entrada comum, **When** a arena é executada, **Then** cada estratégia selecionada produz seu resultado para essa mesma entrada.
2. **Given** opções válidas para selecionar estratégias e limitar iterações, **When** a arena inicia, **Then** respeita as opções e imprime resultados identificáveis por estratégia.
3. **Given** nome de estratégia desconhecido ou limite inválido, **When** a arena recebe as opções, **Then** rejeita a entrada e informa o erro sem iniciar execuções ambíguas.

### Edge Cases

- O provedor de modelo está indisponível, retorna uma saída inválida ou falha durante uma execução.
- A configuração necessária para acessar o provedor está ausente.
- A lista de alertas não contém resultados para o status solicitado.
- Uma ferramenta recebe campos inválidos, um serviço inexistente ou um identificador de incidente inexistente.
- A estratégia atinge o limite de iterações antes de concluir a tarefa, ou o planejador propõe mais etapas do que o máximo permitido.
- O planejador ou replanejador não encontra etapas úteis restantes; a execução deve terminar sem repetir ações concluídas.
- Uma estratégia falha durante a arena; o resultado daquela estratégia deve indicar a falha e não ser apresentado como sucesso.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer uma interface comum para estratégias, que aceite uma entrada operacional e retorne resposta, trilha de eventos tipados e métricas.
- **FR-002**: A trilha MUST distinguir pensamento, ação, observação, plano, crítica e resposta; eventos de ação MUST identificar a ferramenta e seus argumentos.
- **FR-003**: As métricas MUST incluir a contagem de chamadas ao modelo e a latência total em milissegundos.
- **FR-004**: O sistema MUST obter configuração de acesso ao provedor e identificador do modelo do ambiente de execução, usar temperatura zero e falhar explicitamente quando a configuração obrigatória estiver ausente.
- **FR-005**: As ferramentas operacionais MUST permitir listar alertas por status, abrir incidentes com título, serviço e severidade, e resolver incidentes por identificador. Entradas e saídas MUST ser validadas e erros MUST ser reportados explicitamente.
- **FR-006**: O conjunto inicial de demonstração MUST incluir cinco serviços e seis alertas: três em estado firing e três em estado resolved.
- **FR-007**: O sistema MUST disponibilizar um comando repetível para carregar o conjunto inicial de demonstração do arquivo JSON em um store em memória e MUST indicar se o carregamento falhou.
- **FR-008**: As ferramentas MUST usar o arquivo JSON versionado como fonte inicial de serviços e alertas e manter alterações, incluindo novos incidentes, no store em memória durante a execução. Cada processo começa novamente a partir do JSON; testes determinísticos MUST poder usar um store isolado sem depender de rede.
- **FR-009**: A estratégia ReAct MUST decidir e executar operações com as ferramentas disponíveis, preservar o trace completo da execução e respeitar o limite máximo de iterações configurado.
- **FR-010**: A estratégia Plan-and-Execute MUST produzir um plano estruturado de passos textuais, executar um passo por vez com as ferramentas disponíveis, revisar os passos restantes após cada execução e encerrar quando não houver trabalho útil restante. MUST limitar o total de passos executados ou pendentes ao teto de oito, inclusive após replanejamentos, e respeitar o limite de iterações configurado.
- **FR-011**: Toda estratégia MUST contabilizar chamadas ao modelo e produzir métricas e trilha mesmo quando terminar por limite de iterações ou falha reportável.
- **FR-012**: A arena MUST executar pelo menos uma estratégia sobre uma entrada comum, aceitar seleção de estratégias e limite de iterações, e imprimir resposta, trilha e métricas identificadas por estratégia.
- **FR-013**: Testes MUST verificar deterministicamente as operações do store e a formatação da trilha sem depender de acesso à rede.

### Key Entities

- **Estratégia de raciocínio**: Uma forma selecionável de analisar uma entrada operacional e produzir resposta, eventos e métricas.
- **Evento de trilha**: Um registro tipado da execução, incluindo tipo e conteúdo; ações também incluem ferramenta e argumentos.
- **Alerta**: Um sinal operacional associado a um serviço e a um status, incluindo firing ou resolved no conjunto de demonstração.
- **Incidente**: Um registro operacional com título, serviço e severidade, que pode ser aberto ou resolvido.
- **Serviço**: Um sistema operacional ao qual alertas e incidentes podem estar associados.
- **Plano**: Uma sequência ordenada e limitada de passos operacionais que pode ser revista após cada passo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em todos os testes determinísticos do conjunto de demonstração, há exatamente cinco serviços e seis alertas, com três alertas firing e três resolved.
- **SC-002**: Para cada estratégia executada dentro dos limites, 100% dos resultados contêm uma resposta, eventos tipados na ordem de execução e latência não negativa; a contagem de chamadas ao modelo corresponde às chamadas feitas.
- **SC-003**: Em testes de limite, nenhuma estratégia ultrapassa o limite de iterações definido e nenhum plano contém mais de oito passos.
- **SC-004**: 100% dos casos de teste de arena verificam que todas as estratégias selecionadas recebem a mesma entrada e retornam resultados identificados separadamente.
- **SC-005**: Os testes de store e formatação de trilha passam sem requisições de rede.

## Assumptions

- A entrada operacional é texto fornecido à estratégia ou à arena; autenticação de operador e interface web não fazem parte deste escopo.
- A configuração do provedor é lida do ambiente; valores secretos não são armazenados no conjunto de demonstração nem versionados.
- O arquivo `src/scripts/demo-data.json` é a base inicial atual; estado operacional criado ou alterado pelas ferramentas existe apenas na memória do processo e é reiniciado ao iniciar uma nova execução.
- O limite de iterações é um limite por execução de estratégia; o limite máximo de oito passos aplica-se ao total do Plan-and-Execute, inclusive após replanejamentos.
- A palavra "IIalls" no pedido significa contagem de chamadas ao modelo (llmCalls), e "sem passos restantes" é a condição de parada do replanejador quando não há trabalho útil a executar.
- Não se exige rede nos testes de store e formatação; testes de estratégia podem substituir o provedor por uma implementação controlada.
