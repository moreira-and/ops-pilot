# Feature Specification: Conversation History Summarization

**Feature Branch**: `010-history-summarization`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Sumarização de histórico (pruning): tabela conversation_summaries; o que sai das 8 mensagens recentes vira resumo de ~150 tokens preservando decisões, fatos e pendências, MESCLADO ao resumo anterior e persistido - refeito só quando 8 novas saem da janela, nunca a cada request. Resumo entra no contexto; evento \"summarize\". Com teste fake"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manter o contexto de conversas longas (Priority: P1)

Em uma investigação de incidente longa, as mensagens antigas deixam de caber na janela recente (as 8 mensagens mais recentes). Em vez de serem perdidas, elas são condensadas em um resumo curto (cerca de 150 tokens) que preserva decisões tomadas, fatos apurados e pendências. Esse resumo é incluído no contexto das respostas seguintes, junto com as 8 mensagens recentes.

**Why this priority**: É o valor central: o copiloto não "esquece" o que foi decidido ou apurado no início do plantão.

**Independent Test**: Criar uma conversa com mais de 16 mensagens (8 recentes + 8 fora da janela), enviar uma nova mensagem e verificar que o contexto contém o resumo das mensagens antigas além das 8 recentes.

**Acceptance Scenarios**:

1. **Given** uma conversa com 8 mensagens que saíram da janela recente e nenhum resumo prévio, **When** a pessoa envia uma nova mensagem, **Then** é gerado um resumo dessas mensagens, ele é persistido e entra no contexto da resposta.
2. **Given** uma conversa com resumo persistido, **When** a pessoa envia uma nova mensagem, **Then** o contexto contém o resumo e as 8 mensagens mais recentes em ordem cronológica.
3. **Given** mensagens fora da janela contendo decisões, fatos e pendências, **When** o resumo é gerado, **Then** esses três tipos de informação aparecem no resumo.

---

### User Story 2 - Mesclar resumos sem reprocessar tudo (Priority: P1)

Quando novas mensagens saem da janela, o novo resumo é a mesclagem do resumo anterior com o conteúdo recém-expirado, mantendo o tamanho próximo de 150 tokens. O resumo só é refeito quando 8 novas mensagens saíram da janela desde o último resumo — nunca a cada requisição.

**Why this priority**: Controla custo e latência: evita chamadas extras de resumo a cada mensagem e impede que informação antiga seja descartada ao resumir.

**Independent Test**: Com resumo existente, enviar mensagens uma a uma e verificar que nenhum novo resumo é gerado até que 8 novas mensagens tenham saído da janela; então verificar que um único novo resumo é gerado incorporando o anterior.

**Acceptance Scenarios**:

1. **Given** uma conversa com resumo cobrindo até certo ponto e menos de 8 mensagens novas fora da janela, **When** a pessoa envia mensagens, **Then** nenhum novo resumo é gerado e o resumo existente é reutilizado.
2. **Given** 8 novas mensagens saíram da janela desde o último resumo, **When** a pessoa envia a próxima mensagem, **Then** é gerado um novo resumo mesclando o anterior com essas 8 mensagens e ele substitui o anterior na persistência.
3. **Given** um resumo já persistido, **When** o mesmo estado da conversa é consultado repetidamente, **Then** nenhum novo resumo é gerado.

---

### User Story 3 - Observar e testar a sumarização (Priority: P2)

Quem opera o OpsPilot consegue ver quando uma sumarização ocorre por meio do evento "summarize". A lógica é verificável em testes automatizados com um sumarizador falso, sem chamadas a provedores externos.

**Why this priority**: Dá visibilidade operacional e garante regressão confiável sem custo nem não determinismo.

**Independent Test**: Executar os testes com sumarizador falso e verificar contagem de chamadas, entradas recebidas e emissão do evento.

**Acceptance Scenarios**:

1. **Given** uma sumarização concluída, **When** ela termina, **Then** o evento "summarize" é emitido com informação suficiente para diagnóstico (conversa, quantidade de mensagens resumidas).
2. **Given** nenhuma sumarização necessária, **When** a requisição é processada, **Then** o evento "summarize" não é emitido.
3. **Given** um sumarizador falso configurado nos testes, **When** a lógica de pruning é exercitada, **Then** todo o comportamento (gatilho, mesclagem, persistência) é verificável sem rede.

### Edge Cases

- Conversa com até 8 mensagens: nada sai da janela, nenhum resumo é gerado.
- Conversa com menos de 8 mensagens fora da janela e sem resumo prévio: nenhum resumo é gerado; essas mensagens ficam fora do contexto até o gatilho (ver Assumptions).
- Falha do sumarizador: a resposta ao usuário não pode falhar; o resumo anterior (se houver) é mantido e a tentativa é refeita na próxima requisição elegível.
- Requisições concorrentes na mesma conversa: no máximo um resumo por faixa de mensagens é persistido.
- Resumo que excede ~150 tokens: deve ser condensado para manter o tamanho alvo.
- Conversa inexistente ou sem mensagens: nenhum resumo é criado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST manter como janela recente as 8 mensagens mais recentes da conversa, em ordem cronológica.
- **FR-002**: O sistema MUST condensar as mensagens que saem da janela recente em um resumo de aproximadamente 150 tokens.
- **FR-003**: O resumo MUST preservar decisões, fatos e pendências presentes nas mensagens condensadas.
- **FR-004**: Ao gerar um novo resumo, o sistema MUST mesclá-lo ao resumo anterior da conversa, de modo que informação já resumida não se perca.
- **FR-005**: O sistema MUST persistir o resumo por conversa na tabela `conversation_summaries`, incluindo a marcação de até onde a conversa já foi resumida.
- **FR-006**: O sistema MUST gerar novo resumo somente quando 8 novas mensagens tiverem saído da janela desde o último resumo, e MUST NOT gerar resumo a cada requisição.
- **FR-007**: O sistema MUST incluir o resumo persistido no contexto fornecido ao agente, junto com as 8 mensagens recentes.
- **FR-008**: O sistema MUST emitir o evento "summarize" sempre que uma sumarização for realizada, e somente nesses casos.
- **FR-009**: Uma falha na sumarização MUST NOT impedir a resposta ao usuário e MUST NOT corromper o resumo existente.
- **FR-010**: O sistema MUST permitir substituir o sumarizador por uma implementação falsa em testes, sem acesso a provedores externos.
- **FR-011**: O sistema MUST incluir testes automatizados com sumarizador falso cobrindo gatilho, mesclagem, persistência, inclusão no contexto e emissão do evento.

### Key Entities

- **Resumo da conversa (`conversation_summaries`)**: Resumo condensado de uma conversa; atributos: conversa associada, texto do resumo, marcação do último ponto já resumido, data de atualização. Um resumo vigente por conversa.
- **Conversa / Mensagem**: Entidades existentes; mensagens fora das 8 mais recentes são candidatas a resumo.
- **Evento "summarize"**: Registro observável de que uma sumarização ocorreu, com a conversa e a quantidade de mensagens resumidas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em conversas com mais de 16 mensagens, 100% das respostas incluem o resumo e as 8 mensagens recentes no contexto.
- **SC-002**: Em uma sequência de requisições consecutivas, o número de sumarizações é no máximo ⌊(mensagens fora da janela) / 8⌋; nenhuma requisição sem 8 novas expirações dispara sumarização.
- **SC-003**: O resumo permanece em torno de 150 tokens (tolerância de ±20%) mesmo após várias mesclagens.
- **SC-004**: Em casos de teste com decisões, fatos e pendências conhecidos, 100% desses itens do resumo anterior e das mensagens novas continuam presentes após a mesclagem.
- **SC-005**: A suíte de testes da funcionalidade roda sem acesso à rede e passa de forma determinística.
- **SC-006**: Falhas simuladas do sumarizador não causam nenhuma resposta de erro ao usuário.

## Assumptions

- A funcionalidade estende as conversas persistentes existentes (007); a janela anterior de 12 mensagens passa a ser de 8 mensagens recentes mais o resumo.
- Mensagens expiradas ainda não resumidas (menos de 8 desde o último resumo) ficam fora do contexto até o próximo gatilho; esse é o custo aceito do limiar de 8.
- "Tokens" é uma medida aproximada; o limite de ~150 é um alvo, não um corte rígido exato.
- O sumarizador usa o mesmo provedor de modelo já configurado no OpsPilot; em testes é substituído por uma implementação falsa.
- O evento "summarize" usa o mecanismo de eventos/observabilidade já existente.
- Fora de escopo: memória semântica entre conversas (008) e aprendizado/reflexão (009).
