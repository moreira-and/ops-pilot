# Feature Specification: Semantic Memory

**Feature Branch**: `008-semantic-memory`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Memória semântica: MemoryStore por userId - rember (dedup > 0.92), recall top-3 por produto escalar (min 0.3), forget; tabela memories, embedding all-MiniLm-L6-v2 em BLOB; /chat ganha userId e injeta o recall no prompt. user: @huggingface/transformers com pooling: mean + normaliza: true e lazy singleton src/memory/embeddings.ts e src/memory/memory-store.ts. as colunas de memories (id, user_id, fact, embedding, created_at)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guardar fatos pessoais (Priority: P1)

Uma pessoa pode guardar fatos úteis para futuras conversas com o OpsPilot. Fatos equivalentes não devem ocupar espaço repetido, e as lembranças ficam associadas somente àquela pessoa.

**Why this priority**: Guardar informações reutilizáveis é a base para que o copiloto mantenha contexto entre conversas distintas.

**Independent Test**: Guardar um fato e depois guardar outro semanticamente equivalente para a mesma pessoa; verificar que há somente uma lembrança equivalente e que outra pessoa não consegue recuperá-la.

**Acceptance Scenarios**:

1. **Given** um fato novo para uma pessoa, **When** o fato é guardado, **Then** ele fica disponível como lembrança identificável e associada àquela pessoa.
2. **Given** uma lembrança existente, **When** é guardado para a mesma pessoa um fato com similaridade maior que 0,92, **Then** não é criada uma lembrança duplicada.
3. **Given** um fato guardado por uma pessoa, **When** outra pessoa consulta suas lembranças, **Then** o fato não é retornado.

### User Story 2 - Usar lembranças no chat (Priority: P1)

Ao conversar, a pessoa pode receber respostas que levem em conta fatos relevantes guardados anteriormente, mesmo quando a mensagem atual usa palavras diferentes das lembranças.

**Why this priority**: Usar o contexto salvo para responder é o principal benefício da memória semântica.

**Independent Test**: Guardar um fato e fazer uma pergunta com vocabulário sem palavras em comum com esse fato; verificar que a lembrança semanticamente relevante é incluída no contexto da resposta.

**Acceptance Scenarios**:

1. **Given** uma pessoa com lembranças semanticamente relacionadas à mensagem, **When** ela envia uma solicitação de chat identificada por `userId`, **Then** até três lembranças relevantes, com similaridade estritamente maior que 0,3, são incluídas no contexto antes da resposta.
2. **Given** mais de três lembranças relevantes, **When** a pessoa envia uma solicitação de chat, **Then** são incluídas somente as três mais relevantes.
3. **Given** uma pergunta cuja formulação não compartilha palavras com uma lembrança relevante, **When** a pessoa envia a pergunta, **Then** a lembrança ainda pode ser recuperada por significado.
4. **Given** uma pessoa sem lembranças que atinjam o limite de relevância, **When** ela envia uma solicitação de chat, **Then** o chat prossegue sem lembranças adicionais.

### User Story 3 - Esquecer um fato (Priority: P2)

Uma pessoa pode remover uma lembrança específica que não deseja mais que influencie respostas futuras.

**Why this priority**: A pessoa precisa poder corrigir o contexto persistente e controlar quais fatos continuam disponíveis.

**Independent Test**: Guardar um fato, removê-lo usando seu identificador e consultar novamente; verificar que ele não é mais retornado.

**Acceptance Scenarios**:

1. **Given** uma lembrança pertencente à pessoa, **When** ela solicita que a lembrança seja esquecida, **Then** a lembrança deixa de aparecer em consultas futuras.
2. **Given** uma lembrança pertencente a outra pessoa, **When** uma pessoa tenta esquecê-la, **Then** a lembrança permanece intacta e não é revelada.
3. **Given** um identificador de lembrança inexistente ou já removido, **When** a pessoa solicita que ela seja esquecida, **Then** o resultado indica que nenhuma lembrança foi removida.

### Edge Cases

- Similaridade exatamente igual a 0,92 não ultrapassa o limite de deduplicação e não é tratada como duplicata por essa regra.
- Similaridade exatamente igual a 0,3 não atende ao limite estrito de recuperação.
- Se não houver lembranças acima do limite de recuperação, o contexto do chat permanece sem lembranças.
- `userId` ausente ou vazio deve ser rejeitado antes de acessar a memória, sem misturar dados entre pessoas.
- Uma falha ao guardar, recuperar ou esquecer uma lembrança deve ser comunicada como falha, não como sucesso.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST associar cada lembrança a exatamente um `userId` e MUST restringir consultas, deduplicação e remoções às lembranças desse usuário.
- **FR-002**: O sistema MUST permitir guardar um fato e MUST disponibilizar para ele um identificador único e uma data de criação.
- **FR-003**: Ao guardar um fato para um usuário, o sistema MUST evitar a criação de duplicata quando sua similaridade com uma lembrança existente do mesmo usuário for maior que 0,92.
- **FR-004**: O chat MUST receber um `userId` válido e MUST consultar as lembranças desse usuário antes de compor a resposta.
- **FR-005**: O sistema MUST ordenar as lembranças do usuário por relevância decrescente, selecionar no máximo três candidatas e, depois dessa seleção, MUST excluir candidatas cuja similaridade seja menor ou igual a 0,3.
- **FR-006**: A recuperação MUST reconhecer fatos relevantes por significado mesmo quando a mensagem e o fato não compartilham palavras.
- **FR-007**: O sistema MUST permitir esquecer uma lembrança pelo seu identificador, sem permitir que essa operação remova lembranças de outro usuário.
- **FR-008**: A ausência de lembranças relevantes MUST NOT impedir o processamento normal do chat.
- **FR-009**: As lembranças MUST permanecer disponíveis em solicitações futuras até serem esquecidas.
- **FR-010**: Falhas nas operações de memória MUST ser comunicadas explicitamente e MUST NOT ser apresentadas como operações concluídas com sucesso.

### Key Entities

- **Lembrança**: Fato persistente associado a uma única pessoa; possui identificador, `userId`, conteúdo do fato, representação semântica e data de criação.
- **Usuário**: Pessoa identificada por `userId`, proprietária das lembranças que podem ser consultadas, usadas no chat ou esquecidas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em todos os testes de isolamento entre usuários, nenhuma lembrança de uma pessoa é retornada ou removida por operações de outra pessoa.
- **SC-002**: Em todos os testes de deduplicação, similaridade acima de 0,92 impede uma nova lembrança equivalente, enquanto similaridade igual ou abaixo de 0,92 não é bloqueada por esse limite.
- **SC-003**: Em todos os testes de recuperação, são selecionadas no máximo três candidatas em ordem decrescente de relevância antes de excluir aquelas com similaridade menor ou igual a 0,3.
- **SC-004**: Uma lembrança relevante é recuperada em um caso de teste cuja pergunta e fato não compartilham palavras, demonstrando recuperação por significado.
- **SC-005**: Após uma lembrança ser esquecida, ela não aparece em consultas posteriores do mesmo usuário.
- **SC-006**: O chat continua respondendo normalmente em 100% dos casos de teste sem lembranças relevantes.

## Assumptions

- Cada operação de memória identifica o usuário por `userId`; autenticação e autorização para estabelecer esse identificador pertencem ao fluxo existente e não são redefinidas por esta funcionalidade.
- A deduplicação compara um fato novo somente com lembranças do mesmo usuário; quando detectada uma duplicata, a lembrança existente é mantida sem criar outra.
- “Esquecer” significa remover uma lembrança específica por seu identificador, sempre dentro do escopo do usuário proprietário.
- Deduplicação usa similaridade estritamente maior que 0,92. Recall ordena por similaridade, seleciona até três candidatas e só então mantém pontuações estritamente maiores que 0,3.
- A especificação descreve o comportamento esperado; escolhas de biblioteca, modelo de embeddings, armazenamento binário e organização interna são definidas durante o planejamento técnico.
