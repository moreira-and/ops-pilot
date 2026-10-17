# Feature Specification: API HTTP do Chat

**Feature Branch**: `003-chat-http-api`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "POST /chat em src/http/server.ts (ou padrão do express): body {message, strategy?, reflact?} validado com zod; default react. 200 {answer, trace, metrics}; 400 body inválido (issue do zod); 422 estratégia desconhecida; timeout 180s -> 504. Registry em src/agents/index.ts (nome -> estratégia; reflact aplica withReflaction). teste de integração com estratégia fake determinística, sem rede"

## User Scenarios & Testing

### User Story 1 - Enviar uma mensagem ao agente (Priority: P1)

Como operador de plantão, quero enviar uma mensagem ao agente pelo serviço HTTP e receber sua resposta, para consultar rapidamente o OpsPilot usando a estratégia padrão.

**Why this priority**: A interação básica por HTTP é a capacidade central desta interface e permite entregar valor sem configuração adicional.

**Independent Test**: Enviar uma mensagem válida sem indicar estratégia usando uma estratégia fake determinística e verificar a resposta de sucesso, sem acessar a rede.

**Acceptance Scenarios**:

1. **Given** uma mensagem válida sem estratégia informada, **When** o cliente envia a solicitação ao serviço de chat, **Then** o serviço executa a estratégia `react` e responde com status 200 contendo `answer`, `trace` e `metrics`.
2. **Given** uma mensagem válida e uma estratégia conhecida, **When** o cliente envia a solicitação, **Then** o serviço executa a estratégia solicitada e retorna sua resposta, trace e métricas.

### User Story 2 - Escolher estratégia e reflexão (Priority: P2)

Como operador de plantão, quero selecionar uma estratégia conhecida e, quando necessário, solicitar reflexão, para adaptar a execução à consulta sem mudar a forma de chamar o serviço.

**Why this priority**: A seleção permite que clientes aproveitem estratégias registradas e a capacidade de reflexão já disponível no agente.

**Independent Test**: Registrar estratégias fake e determinísticas, chamar o serviço com e sem `reflact`, e verificar qual estratégia é executada e se a decoradora de reflexão é aplicada, sem chamadas de rede.

**Acceptance Scenarios**:

1. **Given** uma estratégia registrada diferente da padrão, **When** o cliente a informa, **Then** somente essa estratégia é executada.
2. **Given** uma estratégia registrada e `reflact` habilitado, **When** o serviço prepara a execução, **Then** a estratégia registrada é envolvida por `withReflaction` antes de ser executada.
3. **Given** `reflact` omitido ou desabilitado, **When** o serviço prepara a execução, **Then** a estratégia registrada é executada sem a decoradora de reflexão.

### User Story 3 - Receber erros claros para solicitações inválidas ou demoradas (Priority: P1)

Como cliente HTTP, quero receber erros distintos para dados inválidos, estratégia inexistente e execução que exceda o tempo limite, para que eu possa corrigir a solicitação ou tratar a falha adequadamente.

**Why this priority**: Respostas de erro previsíveis são necessárias para integrar a API com segurança e evitar que clientes interpretem falhas como respostas válidas.

**Independent Test**: Enviar corpos inválidos, nomes de estratégia desconhecidos e uma execução fake que não conclua dentro do limite; verificar status e formato de erro sem rede.

**Acceptance Scenarios**:

1. **Given** um corpo ausente ou que não corresponda ao esquema, **When** a solicitação é validada, **Then** o serviço retorna 400 com os issues produzidos pela validação Zod.
2. **Given** um nome de estratégia que não consta no registro, **When** a solicitação é processada, **Then** o serviço retorna 422 indicando que a estratégia é desconhecida.
3. **Given** uma execução que permanece sem resposta por 180 segundos, **When** o limite de tempo é atingido, **Then** o serviço encerra a espera e retorna 504.

### Edge Cases

- `message` ausente, vazio ou de tipo diferente de texto é rejeitado pela validação do corpo.
- `strategy` omitida seleciona `react`; um valor fornecido que não corresponda a uma estratégia registrada resulta em 422.
- `reflact` omitido equivale a reflexão desabilitada; valores que não sejam booleanos são rejeitados pela validação do corpo.
- Se a execução completar exatamente antes do limite, a resposta normal é retornada; se o limite de 180 segundos for atingido primeiro, retorna-se 504.
- A saída de sucesso inclui as três propriedades `answer`, `trace` e `metrics`; falhas não devem ser apresentadas como respostas 200.
- O teste de integração usa estratégia controlada e não depende de acesso à rede nem de serviços externos.

## Requirements

### Functional Requirements

- **FR-001**: O serviço MUST disponibilizar uma operação HTTP `POST /chat` para receber mensagens do usuário.
- **FR-002**: O corpo da solicitação MUST aceitar `message` obrigatório do tipo texto, `strategy` opcional do tipo texto e `reflact` opcional do tipo booleano, validando a entrada com Zod.
- **FR-003**: Quando `strategy` for omitida, o serviço MUST selecionar a estratégia registrada com o nome `react`.
- **FR-004**: O sistema MUST manter um registro que associa nomes de estratégia a implementações de estratégia e MUST selecionar a implementação correspondente ao nome recebido.
- **FR-005**: Se o nome fornecido em `strategy` não estiver registrado, o serviço MUST responder com status 422 e identificar a estratégia desconhecida.
- **FR-006**: Quando `reflact` for verdadeiro, o serviço MUST aplicar `withReflaction` à estratégia selecionada antes de executá-la; quando omitido ou falso, MUST executar a estratégia sem essa decoração.
- **FR-007**: Para uma execução concluída com sucesso, o serviço MUST responder com status 200 e um corpo contendo `answer`, `trace` e `metrics` correspondentes à execução.
- **FR-008**: Se o corpo estiver ausente ou não corresponder ao esquema, o serviço MUST responder com status 400 e incluir os issues de validação do Zod.
- **FR-009**: O serviço MUST limitar cada execução a 180 segundos e responder com status 504 quando esse limite for excedido.
- **FR-010**: A integração MUST poder ser testada usando uma estratégia fake determinística, sem chamadas de rede ou dependência de serviços externos.

### Key Entities

- **Solicitação de chat**: Mensagem do usuário com uma estratégia opcional e uma opção booleana para ativar reflexão.
- **Estratégia registrada**: Implementação de raciocínio selecionável por um nome conhecido pelo serviço.
- **Resultado do chat**: Resposta da estratégia acompanhada pelo trace e pelas métricas da execução.
- **Erro de solicitação**: Resultado que identifica corpo inválido, estratégia desconhecida ou tempo limite excedido por meio de status HTTP distinto.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% das solicitações válidas sem estratégia informada selecionam `react` e retornam status 200 com `answer`, `trace` e `metrics`.
- **SC-002**: 100% dos corpos inválidos retornam status 400 e incluem os issues correspondentes à validação.
- **SC-003**: 100% dos nomes de estratégia não registrados retornam status 422, sem iniciar uma execução de estratégia.
- **SC-004**: Nenhuma solicitação permanece aguardando a execução além de 180 segundos sem receber status 504.
- **SC-005**: Os cenários de integração de sucesso, validação, seleção e timeout podem ser verificados sem rede usando estratégias fake determinísticas.

## Assumptions

- `reflact` é o nome literal do campo da solicitação conforme fornecido pelo requisito.
- O registro contém a estratégia `react`; a lista de outras estratégias disponíveis é definida pelas estratégias efetivamente registradas.
- `withReflaction` é a função de decoração a usar quando a opção `reflact` está habilitada.
- O limite de 180 segundos se aplica à execução individual da estratégia; a validação da solicitação ocorre antes de iniciar esse limite.
- A estrutura interna de `trace` e `metrics` segue os tipos já produzidos pela estratégia e não precisa ser redefinida por esta interface.
