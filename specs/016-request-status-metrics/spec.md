# Feature Specification: Métricas Agregadas de Solicitações

**Feature Branch**: `[016-request-status-metrics]`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "crie GET /status?since=24h sobre requests: total, erros, tokens, custo (:free=0), p50/p95, por rota e modelo"

## User Scenarios & Testing

### User Story 1 - Acompanhar métricas recentes de solicitações (Priority: P1)

Como operador de plantão, quero consultar as métricas agregadas das solicitações iniciadas em um período recente, para entender o volume, as falhas, o consumo de tokens, o custo e a latência do serviço.

**Why this priority**: Um resumo do período oferece uma leitura operacional imediata sem exigir a inspeção de cada trace.

**Independent Test**: Consultar o período de 24 horas com registros de sucesso, falha e execução em andamento; comparar contagem, tokens, custo e percentis com um conjunto de dados conhecido.

**Acceptance Scenarios**:

1. **Given** solicitações dentro e fora da janela, **When** o operador consulta `/status?since=24h`, **Then** os totais incluem apenas solicitações iniciadas na janela.
2. **Given** solicitações concluídas e em andamento, **When** o operador consulta as métricas, **Then** `total` inclui ambas, `errors` conta somente solicitações falhas e p50/p95 usam apenas latências conhecidas de solicitações concluídas.
3. **Given** um período sem solicitações, **When** o operador consulta as métricas, **Then** os contadores e tokens são zero, os custos são zero e os percentis são nulos.

### User Story 2 - Comparar rotas e modelos (Priority: P2)

Como operador de plantão, quero comparar as mesmas métricas por rota e por modelo, para identificar caminhos com mais falhas, consumo ou latência.

**Why this priority**: A segmentação torna o resumo útil para localizar diferenças operacionais sem alterar o conjunto de solicitações analisado.

**Independent Test**: Consultar registros distribuídos por mais de uma rota e modelo e conferir que cada grupo e o total geral refletem somente seus próprios registros.

**Acceptance Scenarios**:

1. **Given** solicitações distribuídas entre rotas e modelos, **When** o operador consulta `/status`, **Then** a resposta contém grupos independentes por rota e por modelo, com os mesmos campos agregados do resumo.
2. **Given** uma solicitação sem rota ou modelo conhecido, **When** o operador consulta as métricas, **Then** ela aparece em um grupo sem valor conhecido e não é atribuída a outro grupo.

### Edge Cases

- Um `since` ausente usa a janela padrão de 24 horas; duração malformada, zero ou negativa retorna erro de validação.
- Uma solicitação iniciada dentro da janela permanece contabilizada mesmo se ainda estiver em processamento.
- Solicitações sem métricas de tokens ou latência não inventam valores; a resposta informa quantas solicitações não reportaram tokens e percentis consideram apenas latências disponíveis.
- Modelos com sufixo `:free` têm custo zero mesmo sem preço cadastrado.
- Solicitações pagas sem preço configurado ou sem tokens de entrada/saída são contabilizadas como custo indisponível; seu custo não é apresentado como zero nem como um total completo.
- Um conjunto sem latências disponíveis retorna p50 e p95 como nulos.

## Requirements

### Functional Requirements

- **FR-001**: O sistema MUST disponibilizar `GET /status` com o parâmetro opcional `since`, aceitando durações positivas com sufixo `m`, `h` ou `d`; quando ausente, o período padrão MUST ser `24h`.
- **FR-002**: O sistema MUST filtrar solicitações pela data de início dentro da janela solicitada e retornar os limites efetivos `from` e `to`.
- **FR-003**: O resumo MUST retornar `total` de solicitações no período e `errors` como a quantidade cujo status terminal é `failed`; solicitações `running` contam no total, mas não como erro.
- **FR-004**: O resumo MUST retornar contagens de tokens de entrada, saída e total, mais a quantidade de solicitações sem métricas de tokens reportadas; `total` MUST ser nulo se alguma solicitação não reportar ambos os lados.
- **FR-005**: O resumo MUST retornar p50 e p95 de latência em milissegundos, usando a regra nearest-rank sobre latências conhecidas de solicitações concluídas; se nenhuma latência estiver disponível, ambos os valores MUST ser nulos.
- **FR-006**: O sistema MUST calcular custos em USD usando preços configurados por modelo, expressos por milhão de tokens de entrada e saída, e MUST aplicar custo zero a modelos cujo identificador termina em `:free`.
- **FR-007**: Solicitações pagas sem preço ou sem contagens completas de tokens MUST ser contadas como `costUnavailableRequests`; modelos pagos sem preço MUST também ser contados como `unpricedRequests`. O custo total MUST ser nulo enquanto houver custo indisponível, para não apresentar um subtotal como total completo.
- **FR-008**: A resposta MUST incluir `byRoute` e `byModel`, com contagem, erros, tokens, custo, `costUnavailableRequests`, `unpricedRequests` e p50/p95 para cada grupo.
- **FR-009**: Registros sem rota ou modelo conhecido MUST ser representados em grupos próprios com chave nula e não podem ser descartados ou misturados com grupos conhecidos.
- **FR-010**: O sistema MUST validar `since` e o formato da resposta na fronteira HTTP; um período inválido MUST retornar HTTP 400 sem consulta de status com sucesso.

### Key Entities

- **Resumo de status**: Agregados de solicitações na janela, incluindo contagem, erros, tokens, custo e percentis de latência.
- **Grupo de agregação**: Resumo associado a uma rota ou modelo, com o mesmo conjunto de métricas do total.
- **Preço de modelo**: Preço configurado em USD por milhão de tokens de entrada e de saída para um identificador de modelo; modelos `:free` não dependem desse registro.
- **Solicitação**: Execução existente, com rota, modelo, estado, horários, latência e métricas de tokens disponíveis.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Para qualquer janela válida, `total` e `errors` correspondem exatamente às solicitações iniciadas nessa janela e aos estados registrados.
- **SC-002**: Os totais de tokens e cada grupo por rota/modelo correspondem à soma das métricas reportadas pelas solicitações incluídas.
- **SC-003**: p50 e p95 correspondem aos valores nearest-rank calculados sobre as latências conhecidas das solicitações concluídas.
- **SC-004**: Solicitações de modelos `:free` contribuem exatamente USD 0; nenhuma solicitação paga sem preço cadastrado é apresentada como tendo custo zero ou custo completo.
- **SC-005**: Uma janela sem dados retorna contagens e tokens iguais a zero e percentis nulos, sem erro de consulta.

## Assumptions

- `since` é uma duração relativa terminada em `m`, `h` ou `d`, e a janela termina no instante da consulta.
- A janela usa `startedAt`, pois o objetivo é contar execuções iniciadas no período, inclusive as que continuam em andamento.
- Tokens de entrada e saída são coletados quando reportados pelos provedores; valores indisponíveis não são inferidos.
- A tabela de preços é mantida pela aplicação, usa USD por milhão de tokens e identifica preços pelo ID exato do modelo; modelos pagos não cadastrados permanecem explicitamente não precificados.
- O agrupamento por modelo usa o `modelUsed` efetivo registrado para cada solicitação; os tokens são agregados no nível da solicitação.
- Os custos são estimativas segundo a tabela de preços atual da aplicação, não uma reconciliação de cobrança histórica do provedor.
- O agrupamento preserva uma categoria nula para rota ou modelo indisponível.
