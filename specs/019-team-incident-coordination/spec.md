# Feature Specification: Team Incident Coordination

**Feature Branch**: `019-team-incident-coordination`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "Modo equipe em src/team/: supervisor com withStructuredOutput({next, brief}) sobre um blackboard no estado. Papéis: analista (só leitura, não propõe), planejador (sem tools), executor (incidentes, sem bypass). Evento "handoff" no trace, renderizado no "ver raciocínio". Rota "team", teto 8. O supervisor usa next = done para concluir e registra from/to/brief no handoff. O analista lista alertas com data/severidade, incidentes abertos e resolvidos, runbooks, status de provedores e fatos/janelas conhecidos, sem propor soluções."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Coordenar uma investigação de incidente (Priority: P1)

Como operador de plantão, quero encaminhar uma solicitação de incidente ao modo equipe, para receber uma resposta coordenada a partir do contexto e das informações compartilhadas durante a investigação.

**Why this priority**: A coordenação de papéis é o propósito central do modo equipe e permite ao operador obter análise, planejamento e execução de incidentes em um único fluxo.

**Independent Test**: Enviar uma solicitação à rota `team` com contexto de incidente e confirmar que o fluxo retorna uma resposta final ou informa claramente que não conseguiu concluí-la.

**Acceptance Scenarios**:

1. **Given** uma solicitação válida e contexto de incidente, **When** o operador a envia pela rota `team`, **Then** o modo equipe coordena os papéis permitidos e retorna uma resposta relacionada à solicitação.
2. **Given** observações e resultados são acrescentados ao quadro compartilhado, **When** o trabalho é transferido a outro papel na mesma solicitação, **Then** esse papel recebe o contexto disponível sem acesso ao quadro de solicitações independentes.
3. **Given** uma solicitação sem informação suficiente para concluir, **When** o modo equipe termina a investigação, **Then** informa o que permanece desconhecido ou incompleto sem inventar resultados.
4. **Given** uma solicitação em processamento, **When** o limite de oito handoffs é alcançado antes da conclusão, **Then** o fluxo para e apresenta um resultado explicitamente incompleto, sem iniciar outro handoff.

### User Story 2 - Preservar os limites de cada papel (Priority: P1)

Como operador de plantão, quero que cada papel respeite suas permissões, para que análise e planejamento não executem ações e que a execução de incidentes não contorne controles de segurança ou aprovação.

**Why this priority**: A separação de responsabilidades reduz o risco de ações operacionais não autorizadas e mantém a análise distinta da execução.

**Independent Test**: Exercitar cada papel isoladamente e confirmar que o analista apenas relata observações, o planejador não executa ferramentas e o executor só realiza operações de incidente permitidas pelos controles aplicáveis.

**Acceptance Scenarios**:

1. **Given** o analista recebe contexto ou resultados de ferramentas, **When** ele responde, **Then** fornece observações de leitura sem recomendar uma proposta ou executar uma ação.
2. **Given** o planejador recebe observações, **When** elabora próximos passos, **Then** apresenta um plano sem invocar ferramentas ou executar operações.
3. **Given** o executor recebe uma tarefa de incidente, **When** uma operação é permitida pelos controles aplicáveis, **Then** executa somente a operação de incidente autorizada e reporta o resultado observado.
4. **Given** uma operação exigiria contornar uma aprovação, permissão ou controle de segurança, **When** o executor recebe essa tarefa, **Then** não a executa e informa que o controle impede a ação.

### User Story 3 - Inspecionar transições entre papéis (Priority: P2)

Como operador, quero ver as transferências entre papéis no trace de “Ver raciocínio”, para entender como a investigação avançou e quais instruções foram passadas entre os participantes.

**Why this priority**: A visibilidade das transferências permite auditar a sequência de trabalho e interpretar a resposta final.

**Independent Test**: Executar uma solicitação que passe por mais de um papel, abrir “Ver raciocínio” e confirmar que cada handoff aparece associado à execução e na ordem em que ocorreu.

**Acceptance Scenarios**:

1. **Given** o supervisor escolhe um próximo papel ou conclui a investigação, **When** a decisão é emitida, **Then** o trace registra um evento `handoff` com origem `supervisor`, destino escolhido e o resumo ou resposta final transferida.
2. **Given** uma execução contém um ou mais handoffs, **When** o operador abre “Ver raciocínio”, **Then** visualiza esses eventos em ordem junto ao trace daquela execução.
3. **Given** a execução não contém handoffs ou seu trace está indisponível, **When** o operador abre “Ver raciocínio”, **Then** a interface informa que não há eventos de transferência disponíveis e não mostra eventos de outra execução.

### Edge Cases

- Se a decisão do supervisor não indicar um próximo papel válido ou não incluir um resumo utilizável, o fluxo não deve transferir trabalho para um papel não autorizado; deve encerrar com uma falha explícita.
- Se um papel falhar ou retornar informação inválida, o fluxo deve reportar a falha sem apresentar como concluída uma ação não confirmada.
- Se uma operação do executor for negada ou exigir aprovação adicional, o fluxo deve preservar o estado pendente ou bloqueado e não tentar contornar o controle.
- O limite de oito handoffs deve ser aplicado por solicitação, sem carregar contagem ou contexto de uma solicitação independente.
- O conteúdo compartilhado deve permanecer associado à solicitação que o originou e não deve expor dados de outra investigação.
- Um resultado parcial obtido antes de uma falha ou do limite pode ser apresentado somente se estiver claramente identificado como parcial.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer a rota `team` para receber uma solicitação de investigação ou operação relacionada a incidentes e retornar o resultado da equipe.
- **FR-002**: O sistema MUST manter um quadro compartilhado de contexto e resultados durante cada solicitação, acessível aos papéis participantes daquela solicitação.
- **FR-003**: O supervisor MUST selecionar `analista`, `planejador`, `executor` ou `done` e fornecer `brief`; `done` encerra o fluxo e usa `brief` como resposta final.
- **FR-004**: O analista MUST limitar sua atuação à leitura e relato de fatos disponíveis e MUST NOT propor ações ou executar operações.
- **FR-005**: O planejador MUST produzir próximos passos com base no contexto compartilhado e MUST NOT invocar ferramentas nem executar operações.
- **FR-006**: O executor MUST limitar suas operações ao domínio de incidentes e MUST respeitar permissões, aprovações e controles de segurança existentes, sem oferecer um caminho para contorná-los.
- **FR-007**: O executor MUST distinguir entre operações concluídas, negadas, pendentes e falhas, e MUST NOT afirmar sucesso sem confirmação do resultado.
- **FR-008**: O sistema MUST interromper a coordenação após no máximo oito handoffs em uma solicitação e MUST indicar quando a conclusão não tiver sido alcançada dentro desse limite.
- **FR-009**: Cada decisão do supervisor MUST gerar um evento `handoff` no trace da solicitação com `from: "supervisor"`, `to` igual ao próximo papel ou `done`, e o `brief` transferido.
- **FR-010**: A visualização “Ver raciocínio” MUST apresentar os eventos `handoff` do trace associado à resposta em ordem e MUST NOT misturar eventos de outras solicitações.
- **FR-011**: Falhas de seleção, execução ou comunicação MUST ser apresentadas explicitamente e MUST NOT ser substituídas por uma resposta que indique sucesso.

### Key Entities *(include if feature involves data)*

- **Solicitação de equipe**: Pedido de investigação ou operação de incidente, com contexto isolado e limite de coordenação próprio.
- **Quadro compartilhado**: Contexto, observações, planejamento e resultados reunidos durante uma solicitação e disponíveis aos papéis participantes.
- **Papel**: Participante com uma responsabilidade e permissões definidas: analista, planejador ou executor.
- **Handoff**: Evento que registra a decisão do supervisor com origem, destino (incluindo `done`) e o resumo da tarefa ou resposta final.
- **Trace**: Sequência de eventos associada a uma solicitação, incluindo handoffs e resultados relevantes apresentados em “Ver raciocínio”.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos testes de solicitações encaminhadas à rota `team`, o sistema retorna uma resposta final ou um estado explícito de falha ou conclusão incompleta.
- **SC-002**: Em 100% dos testes, o fluxo não ultrapassa oito handoffs por solicitação e identifica claramente quando esse limite impede a conclusão.
- **SC-003**: Em 100% dos testes de conformidade de papéis, o analista não propõe nem executa ações, o planejador não usa ferramentas e o executor não contorna controles.
- **SC-004**: Em 100% dos testes com decisões do supervisor, o trace registra os destinos e briefs em ordem e “Ver raciocínio” exibe somente eventos da solicitação correspondente.
- **SC-005**: Em 100% dos testes de operações do executor, a interface distingue sucesso confirmado de operação pendente, negada ou falha.
- **SC-006**: Pelo menos 90% dos operadores de teste conseguem identificar, pela resposta final, se o trabalho foi concluído, ficou parcial ou foi bloqueado.

## Assumptions

- O limite “teto 8” significa no máximo oito handoffs durante uma solicitação, não oito participantes distintos.
- `done` é o destino terminal do supervisor; sua decisão aparece no trace, mas não consome um dos oito despachos para papéis.
- As ferramentas e controles existentes para incidentes definem quais operações o executor pode realizar e quais aprovações são obrigatórias; esta feature não os enfraquece nem os substitui.
- O quadro compartilhado é temporário e isolado por solicitação; persistência entre solicitações não faz parte deste escopo.
- Uma transferência só é válida quando o próximo papel escolhido pertence ao conjunto de papéis permitido e o resumo pode ser entregue ao papel de destino.
- A resposta final pode incluir resultados parciais, desde que os identifique como parciais e não declare como concluídas operações sem confirmação.
- O contrato de coordenação solicitado usa uma decisão estruturada com os campos `next` e `brief`; a organização de código pretendida é `src/team/`. Estes são requisitos técnicos explicitamente fornecidos, não decisões em aberto para o planejamento.
