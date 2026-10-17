# Feature Specification: Camada Reflection

**Feature Branch**: `main`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "Camada Reflection: withReflection(strategy, opts) decora qualquer ReasoningStrategy: executa a base; um crítico (mesmo modelo, saída estruturada { approved, feedback }) avalia a resposta contra as observações do trace; se reprovar, regenera com o feedback no contexto; para em approved ou maxReflections (default 2). Evento "critique" no trace; métricas somam as chamadas extras. Arena: reflect:react e reflect:plan-and-execute"

## User Scenarios & Testing

### User Story 1 - Respostas revisadas com limite (Priority: P1)

Como operador de plantão, quero que uma estratégia de raciocínio revise sua resposta com base nas observações coletadas, para receber uma resposta mais consistente com as evidências do incidente sem deixar a execução se prolongar indefinidamente.

**Why this priority**: A revisão baseada em evidências é o valor central da camada; o limite mantém o custo e a duração previsíveis.

**Independent Test**: Executar uma estratégia decorada com um crítico controlado que primeiro rejeita e depois aprova; confirmar que o feedback chega à regeneração e que a execução termina ao aprovar.

**Acceptance Scenarios**:

1. **Given** uma estratégia que produz uma resposta e observações no trace, **When** o crítico aprova a primeira resposta, **Then** a resposta é retornada sem regeneração.
2. **Given** que o crítico rejeita uma resposta com feedback, **When** ainda há tentativas permitidas, **Then** a estratégia produz uma nova resposta com esse feedback no contexto e o crítico a avalia.
3. **Given** que todas as respostas avaliadas são rejeitadas, **When** o limite de reflexões é atingido, **Then** a execução termina e retorna a resposta mais recente sem declará-la aprovada.
4. **Given** que `maxReflections` é zero, **When** a estratégia decorada é executada, **Then** a resposta base é retornada sem crítica ou regeneração.
5. **Given** que `maxReflections` é negativo ou não inteiro, **When** a execução é configurada, **Then** o valor é rejeitado explicitamente.

### User Story 2 - Auditoria do processo de reflexão (Priority: P2)

Como operador que investiga uma resposta, quero ver no trace as avaliações do crítico e contabilizadas as chamadas adicionais, para entender por que a resposta foi revisada e acompanhar o custo da revisão.

**Why this priority**: A transparência das decisões e do custo é essencial para diagnosticar respostas e operar estratégias refletidas.

**Independent Test**: Executar uma reflexão controlada e comparar os eventos `critique` e o total de chamadas com as avaliações e invocações realmente realizadas.

**Acceptance Scenarios**:

1. **Given** que o crítico avalia uma resposta, **When** a execução termina, **Then** o trace contém um evento `critique` com `approved` e `feedback` na posição correspondente à avaliação.
2. **Given** uma estratégia base e chamadas adicionais do crítico e da regeneração, **When** a execução termina, **Then** `metrics.llmCalls` inclui cada invocação real uma única vez, inclusive as chamadas adicionais.
3. **Given** que uma avaliação retorna dados inválidos ou uma chamada falha, **When** o erro ocorre, **Then** a execução o reporta explicitamente e não trata a resposta como aprovada.

### User Story 3 - Seleção da reflexão na Arena (Priority: P2)

Como usuário da Arena, quero selecionar as variantes refletidas das estratégias disponíveis, para comparar a execução padrão com a execução revisada sem alterar o fluxo de seleção existente.

**Why this priority**: A seleção na Arena torna a camada utilizável e comparável pelos usuários do projeto.

**Independent Test**: Executar a Arena com cada seletor refletido e confirmar que a estratégia correspondente é executada com reflexão.

**Acceptance Scenarios**:

1. **Given** uma solicitação à Arena com `reflect:react`, **When** a execução começa, **Then** a estratégia ReAct é executada com a camada Reflection.
2. **Given** uma solicitação à Arena com `reflect:plan-and-execute`, **When** a execução começa, **Then** a estratégia Plan-and-Execute é executada com a camada Reflection.

### Edge Cases

- O crítico aprova imediatamente: não ocorre regeneração.
- O limite é zero: a estratégia base retorna sem avaliação nem chamadas adicionais.
- O limite é atingido sem aprovação: retorna-se a resposta mais recente, identificada no trace como não aprovada.
- O trace não contém observações: o crítico recebe somente as evidências disponíveis e não deve inventar observações.
- O crítico não retorna a estrutura exigida ou uma chamada de modelo falha: a execução reporta um erro explícito, sem tratar a resposta como aprovada.

## Requirements

### Functional Requirements

- **FR-001**: O sistema MUST oferecer `withReflection(strategy, opts)` como decoração compatível com qualquer `ReasoningStrategy`, sem exigir alterações na estratégia decorada.
- **FR-002**: A execução MUST iniciar pela estratégia base e avaliar cada resposta candidata com um crítico que usa o mesmo modelo configurado para a estratégia decorada.
- **FR-003**: A avaliação MUST comparar a resposta com as observações disponíveis no trace e produzir uma saída estruturada com `approved` booleano e `feedback` textual.
- **FR-004**: Quando uma resposta for rejeitada e ainda houver reflexões permitidas, o sistema MUST regenerar a resposta com o feedback do crítico no contexto e avaliar a resposta regenerada.
- **FR-005**: O sistema MUST encerrar a reflexão assim que uma resposta for aprovada ou quando atingir `maxReflections`; o valor padrão de `maxReflections` MUST ser 2. O limite conta o número máximo de regenerações após a resposta inicial.
- **FR-006**: Se o limite for atingido sem aprovação, o sistema MUST retornar a resposta candidata mais recente e manter sua rejeição visível no evento `critique` correspondente no trace.
- **FR-007**: Cada avaliação MUST acrescentar ao trace um evento `critique` que contenha `approved` e `feedback`, mantendo a ordem dos demais eventos e sem expor raciocínio interno oculto.
- **FR-008**: As métricas MUST somar às métricas da estratégia base todas as chamadas adicionais reais do crítico e das regenerações, sem contar nenhuma chamada mais de uma vez; a latência deve cobrir a execução refletida completa.
- **FR-009**: Um limite de zero MUST desativar avaliação e regeneração adicionais. Um limite negativo ou não inteiro MUST ser rejeitado explicitamente.
- **FR-010**: A Arena MUST aceitar os seletores `reflect:react` e `reflect:plan-and-execute`, executando, respectivamente, as variantes refletidas de ReAct e Plan-and-Execute.
- **FR-011**: Saídas inválidas do crítico e falhas durante avaliação ou regeneração MUST ser reportadas explicitamente e nunca interpretadas como aprovação.

### Key Entities

- **Estratégia refletida**: Estratégia de raciocínio decorada que retorna a resposta final, o trace combinado e as métricas totais da execução.
- **Avaliação crítica**: Resultado estruturado de uma avaliação, composto por estado de aprovação e feedback para orientar uma possível regeneração.
- **Evento de crítica**: Registro ordenado de uma avaliação no trace, relacionado à resposta candidata que foi avaliada.
- **Limite de reflexões**: Número máximo de respostas regeneradas permitido após a resposta inicial.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Em todos os casos de aprovação, a execução termina assim que a primeira resposta aprovada é avaliada e não realiza regenerações posteriores.
- **SC-002**: Com o limite padrão, nenhuma execução produz mais de duas regenerações após a resposta inicial.
- **SC-003**: Em execuções refletidas, o total informado de chamadas de modelo corresponde exatamente ao número de invocações reais da estratégia base, do crítico e das regenerações.
- **SC-004**: Cada resposta candidata avaliada possui exatamente um evento `critique` correspondente no trace; uma execução com limite zero não possui eventos de crítica.
- **SC-005**: Ambos os seletores refletidos da Arena concluem uma execução usando a estratégia correspondente e mantêm a resposta e o trace acessíveis ao usuário.

## Assumptions

- `maxReflections` é um inteiro não negativo e representa o número máximo de regenerações; portanto, cada execução pode avaliar a resposta inicial e até duas respostas regeneradas com o valor padrão.
- Ao esgotar o limite sem aprovação, a resposta mais recente continua disponível ao usuário, mas seu estado não é apresentado como aprovado.
- O crítico usa o mesmo modelo configurado (mesma identidade/configuração de modelo) da estratégia base, e não necessariamente a mesma instância em memória.
- O trace público contém apenas dados de progresso apropriados para o usuário; raciocínio interno oculto não é exposto.
- As estratégias ReAct e Plan-and-Execute já existem e são selecionáveis na Arena; esta feature adiciona suas variantes refletidas.
