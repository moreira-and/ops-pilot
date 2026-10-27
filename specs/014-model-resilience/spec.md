# Feature Specification: Resiliência de Modelo

**Feature Branch**: `[014-model-resilience]`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Resiliência de modelo: .env OPENROUTER_MODEL_FALLBACK; fábrica model.ts: retry no primário, depois fallback para modelo reserva; Trace: evento 'fallback', metrics.modelUsed; caso nada funcione, 503"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Continuar atendendo quando o modelo primário falha (Priority: P1)

Durante um incidente, o engenheiro de plantão consulta o OpsPilot. Se o modelo primário apresentar falha transitória (timeout, limite de taxa, indisponibilidade), o sistema tenta novamente o primário e, persistindo a falha, usa automaticamente um modelo reserva configurado, entregando a resposta sem que o usuário precise reenviar a pergunta.

**Why this priority**: O copiloto é usado em momentos críticos; indisponibilidade do provedor não pode deixar o plantonista sem apoio.

**Independent Test**: Simular falhas consecutivas do modelo primário com reserva configurado e verificar que a resposta é entregue com sucesso.

**Acceptance Scenarios**:

1. **Given** primário com falha transitória única, **When** o usuário faz uma pergunta, **Then** o sistema repete a chamada ao primário e responde com ele.
2. **Given** primário que falha em todas as tentativas e reserva configurado e saudável, **When** o usuário faz uma pergunta, **Then** a resposta é entregue pelo reserva.
3. **Given** nenhum reserva configurado, **When** o primário esgota as tentativas, **Then** o comportamento é o de falha total (User Story 3).

---

### User Story 2 - Observabilidade do modelo realmente usado (Priority: P2)

O operador do OpsPilot precisa saber quando o reserva foi acionado e qual modelo gerou cada resposta, para detectar degradação do provedor primário e entender custo/qualidade.

**Why this priority**: Sem visibilidade, o fallback esconde problemas do primário.

**Independent Test**: Forçar um fallback e inspecionar o trace e as métricas da execução.

**Acceptance Scenarios**:

1. **Given** uma execução que acionou o reserva, **When** o trace é consultado, **Then** contém um evento "fallback" indicando o modelo de origem, o de destino e o motivo da falha.
2. **Given** qualquer execução bem-sucedida, **When** as métricas são consultadas, **Then** `metrics.modelUsed` identifica o modelo que produziu a resposta (primário ou reserva).
3. **Given** uma execução sem fallback, **When** o trace é consultado, **Then** não há evento "fallback".

---

### User Story 3 - Falha explícita quando nenhum modelo responde (Priority: P2)

Se primário (após retentativas) e reserva falharem, o cliente da API recebe um erro claro de serviço indisponível, em vez de erro genérico ou resposta travada.

**Why this priority**: Clientes e automações precisam distinguir indisponibilidade temporária de erros de uso.

**Independent Test**: Simular falha de ambos os modelos e verificar o status HTTP e o corpo do erro.

**Acceptance Scenarios**:

1. **Given** primário e reserva indisponíveis, **When** uma requisição chega à API, **Then** a resposta é HTTP 503 com mensagem padronizada, sem expor detalhes internos ou segredos.

---

### Edge Cases

- Reserva não configurado (variável ausente ou vazia): o sistema opera apenas com primário e retentativas.
- Reserva igual ao primário: tratado como configuração inválida, sem loop de tentativas.
- Falhas não transitórias (ex.: credencial inválida, requisição malformada): não devem disparar retentativas inúteis nem fallback.
- Falha no meio de uma execução com múltiplas chamadas ao modelo: cada chamada aplica a política de forma independente e `modelUsed` reflete o modelo da resposta final.
- Ausência do modelo primário continua sendo erro de configuração, não 503.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST aceitar a configuração opcional `OPENROUTER_MODEL_FALLBACK` com o identificador do modelo reserva.
- **FR-002**: O sistema MUST repetir a chamada ao modelo primário um número limitado de vezes antes de recorrer ao reserva.
- **FR-003**: O sistema MUST usar o modelo reserva automaticamente quando o primário esgotar as tentativas.
- **FR-004**: O sistema MUST funcionar normalmente, apenas com retentativas no primário, quando nenhum reserva estiver configurado.
- **FR-005**: O sistema MUST registrar no trace um evento "fallback" sempre que o reserva for acionado, com modelo de origem, modelo de destino e motivo.
- **FR-006**: O sistema MUST expor em `metrics.modelUsed` o modelo que gerou a resposta de cada execução.
- **FR-007**: Quando primário e reserva falharem, o sistema MUST responder HTTP 503 com corpo de erro padronizado e sem vazar detalhes internos.
- **FR-008**: O sistema MUST NOT retentar nem acionar o reserva para falhas que não sejam transitórias ou de indisponibilidade do provedor.
- **FR-009**: As novas configurações MUST ser validadas na carga, e o modelo reserva MUST NOT coincidir com o primário.
- **FR-010**: A falha total MUST ser modelada como erro de domínio traduzido para 503 na borda HTTP.

### Key Entities

- **Configuração de Modelo**: modelo primário, modelo reserva opcional e limite de tentativas.
- **Evento de Fallback**: registro no trace com origem, destino, motivo e momento.
- **Métricas de Execução**: incluem o modelo efetivamente usado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com o primário indisponível e reserva saudável, 100% das consultas recebem resposta sem ação do usuário.
- **SC-002**: 100% das execuções que usaram o reserva possuem evento "fallback" no trace e `modelUsed` correto.
- **SC-003**: Com ambos indisponíveis, 100% das requisições recebem 503 padronizado.
- **SC-004**: Falhas não transitórias resultam em erro imediato, sem tentativas adicionais.
- **SC-005**: A degradação do primário pode ser identificada por um operador consultando apenas o trace e as métricas.

## Assumptions

- Cada modelo é tentado até 2 vezes (uma retentativa) e isso não exige nova configuração nesta versão.
- Falhas não transitórias (ex.: 401) seguem o tratamento de erro existente, sem 503.
- A observabilidade (evento `fallback` e `modelUsed`) cobre o grafo de produção/API; arena e bench ganham apenas a resiliência.
- Há no máximo um modelo reserva.
- A feature se aplica a todas as chamadas ao modelo (grafo de produção, arena e bench).
- Não há mudança no formato de trace e métricas além do evento e campo descritos.
- Depende da configuração existente de OpenRouter e do mecanismo atual de trace/métricas.
