# Feature Specification: Learning Reflector

**Feature Branch**: `009-learning-reflector`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Refletor de aprendizado: após cada resposta, um withStructuredOutput({hasLearning, fact}) lê a ultima mensagem do usuário e destila fatos duráveis (nunca pedido pontual, nunca seguedo) - > memories.remeber assíncrono; tool forget_preference"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aprender fatos duráveis (Priority: P1)

Após receber uma resposta do OpsPilot, a pessoa não precisa repetir fatos pessoais ou preferências que possam melhorar conversas futuras. O sistema avalia somente a mensagem mais recente da pessoa e guarda uma lembrança concisa apenas quando ela contém um fato durável, sem atrasar a resposta já produzida.

**Why this priority**: Aprender fatos úteis automaticamente torna a memória semântica existente prática sem exigir que a pessoa cadastre cada preferência manualmente.

**Independent Test**: Enviar uma mensagem com uma preferência durável e confirmar que, depois da resposta, ela pode ser recuperada pela memória da mesma pessoa; confirmar também que a resposta não espera a conclusão do aprendizado.

**Acceptance Scenarios**:

1. **Given** uma mensagem que declara uma preferência durável, **When** o OpsPilot responde, **Then** o sistema extrai um fato conciso e o encaminha para a memória da mesma pessoa após iniciar a resposta, sem bloquear a entrega dessa resposta.
2. **Given** uma mensagem com uma informação durável que não é uma preferência, **When** o OpsPilot responde, **Then** o fato pode ser aprendido e recuperado em uma conversa futura.
3. **Given** uma mensagem que contém somente uma pergunta ou pedido pontual, **When** o OpsPilot responde, **Then** nenhuma lembrança é criada a partir desse pedido.
4. **Given** uma conversa com mensagens anteriores, **When** o aprendizado é executado, **Then** ele avalia somente a mensagem mais recente da pessoa, sem transformar mensagens do assistente em fatos atribuídos a ela.
5. **Given** uma mensagem sem fato elegível, **When** o sistema conclui a avaliação, **Then** nenhuma lembrança é enviada para gravação.

### User Story 2 - Proteger informações secretas (Priority: P1)

A pessoa pode compartilhar acidentalmente credenciais ou outros segredos durante uma conversa sem que esses valores sejam transformados em lembranças persistentes.

**Why this priority**: O aprendizado automático não pode converter uma revelação pontual de credenciais em contexto duradouro ou expô-las em respostas futuras.

**Independent Test**: Enviar uma mensagem contendo uma credencial ou token e confirmar que nenhuma lembrança contendo o segredo é criada nem aparece em consultas posteriores.

**Acceptance Scenarios**:

1. **Given** uma mensagem que contém senha, token, chave privada ou outra credencial, **When** o sistema avalia o aprendizado, **Then** não guarda o segredo, mesmo que a mensagem contenha outros fatos.
2. **Given** uma mensagem que mistura um fato durável com um segredo, **When** o sistema extrai aprendizado, **Then** qualquer fato guardado exclui o segredo e não permite reconstruir seu valor.

### User Story 3 - Esquecer uma preferência (Priority: P2)

A pessoa pode pedir ao OpsPilot que esqueça uma preferência que já foi aprendida, e o sistema remove somente lembranças correspondentes pertencentes a ela.

**Why this priority**: O controle sobre a memória persistente é necessário para corrigir fatos aprendidos e manter a confiança no aprendizado automático.

**Independent Test**: Criar uma lembrança de preferência, solicitar que ela seja esquecida usando a ferramenta `forget_preference` e confirmar que ela deixa de ser recuperada para essa pessoa, mas não afeta outros usuários.

**Acceptance Scenarios**:

1. **Given** uma pessoa solicita esquecer uma preferência identificável, **When** o OpsPilot usa `forget_preference`, **Then** remove a lembrança correspondente dentro do escopo daquela pessoa e confirma o resultado.
2. **Given** a solicitação de esquecimento não identifica com segurança qual preferência deve ser removida, **When** o OpsPilot processa a solicitação, **Then** não remove lembranças e pede esclarecimento.
3. **Given** uma preferência correspondente não existe, **When** a pessoa solicita esquecê-la, **Then** nenhuma outra lembrança é removida e o resultado informa que não havia correspondência.
4. **Given** uma preferência de outra pessoa, **When** alguém solicita esquecê-la, **Then** essa preferência permanece intacta e não é revelada.

### Edge Cases

- Uma mensagem contém uma pergunta pontual e um fato durável separado: somente o fato durável pode ser aprendido.
- Uma mensagem cita uma credencial como exemplo, texto citado ou conteúdo para análise: o valor secreto continua excluído da memória.
- A extração não encontra um fato utilizável, retorna um fato vazio ou inválido, ou não consegue distinguir uma inferência de uma declaração: nenhuma lembrança é criada.
- A gravação assíncrona falha depois de a resposta já ter sido entregue: a resposta permanece válida; a falha é registrada para diagnóstico e não deve ser apresentada como gravação concluída.
- A solicitação para esquecer corresponde a múltiplas lembranças diferentes ou ambíguas: o sistema pede esclarecimento antes de remover qualquer uma.
- Duas mensagens sucessivas contêm aprendizados equivalentes: a deduplicação existente evita duplicatas para a mesma pessoa.
- `userId` está ausente ou inválido: nenhum aprendizado nem esquecimento é realizado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Após uma resposta bem-sucedida do chat, o sistema MUST avaliar a mensagem mais recente enviada pela pessoa para identificar fatos duráveis que possam melhorar conversas futuras.
- **FR-002**: A avaliação MUST produzir uma decisão estruturada que indique se há aprendizado elegível e, somente nesse caso, um fato conciso a guardar.
- **FR-003**: O sistema MUST NOT guardar perguntas, instruções ou pedidos que sejam apenas pontuais, nem conteúdo do assistente como se fosse um fato declarado pela pessoa.
- **FR-004**: O sistema MUST NOT guardar senhas, tokens, chaves privadas, credenciais ou valores secretos. Quando um segredo estiver junto a um fato elegível, qualquer fato guardado MUST omitir o segredo e detalhes que permitam reconstruí-lo.
- **FR-005**: O processo de aprendizado MUST ser assíncrono em relação à resposta: sua execução ou falha MUST NOT atrasar, invalidar ou alterar uma resposta já entregue.
- **FR-006**: Se a avaliação não identificar um fato elegível, ou produzir conteúdo inválido ou ambíguo, o sistema MUST NOT criar uma lembrança.
- **FR-007**: Cada fato elegível MUST ser guardado usando a memória semântica existente e associado exclusivamente ao `userId` da pessoa que enviou a mensagem.
- **FR-008**: A gravação MUST preservar as regras existentes de deduplicação de memória por pessoa.
- **FR-009**: Falhas de avaliação ou gravação MUST ser registradas para diagnóstico sem serem representadas como gravações bem-sucedidas.
- **FR-010**: O OpsPilot MUST disponibilizar uma ferramenta chamada `forget_preference` para que a pessoa solicite a remoção de uma preferência aprendida.
- **FR-011**: `forget_preference` MUST operar somente sobre lembranças pertencentes ao `userId` da pessoa solicitante e MUST NOT revelar ou remover lembranças de outra pessoa.
- **FR-012**: A ferramenta MUST remover somente a lembrança ou lembranças claramente identificadas pela solicitação; diante de ambiguidade, MUST pedir esclarecimento sem apagar dados.
- **FR-013**: O resultado de `forget_preference` MUST distinguir entre remoção concluída e nenhuma correspondência encontrada, e não MUST afirmar sucesso quando a remoção falhar.

### Key Entities

- **Aprendizado candidato**: Resultado estruturado da avaliação da mensagem mais recente; indica se existe um fato durável elegível e contém o fato conciso quando aplicável.
- **Lembrança**: Fato persistente já mantido pela memória semântica, associado a um único `userId` e sujeito às regras existentes de deduplicação, recuperação e remoção.
- **Solicitação de esquecimento**: Pedido da pessoa para remover uma preferência aprendida; identifica o alvo dentro do escopo exclusivo do usuário solicitante.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos testes com fatos duráveis elegíveis, o fato correto fica disponível para recuperação pelo mesmo usuário após a resposta, sem depender de uma nova gravação manual.
- **SC-002**: Em 100% dos testes com pedidos pontuais, mensagens sem fato elegível ou saídas inválidas da avaliação, nenhuma lembrança é criada.
- **SC-003**: Em 100% dos testes com mensagens contendo segredos, nenhum segredo aparece em lembranças persistidas ou recuperadas.
- **SC-004**: A resposta do chat é entregue sem aguardar a conclusão da avaliação ou gravação de memória em 100% dos testes de falha ou atraso do aprendizado.
- **SC-005**: Em 100% dos testes de esquecimento, somente lembranças claramente correspondentes e pertencentes ao usuário solicitante são removidas; pedidos ambíguos não removem nenhuma.
- **SC-006**: Em 100% dos testes de falha de avaliação, gravação ou remoção, o sistema não informa que a operação foi concluída com sucesso.

## Assumptions

- “Segredo” inclui senhas, tokens de acesso, chaves privadas, credenciais e valores equivalentes que concedam acesso ou autenticação.
- Fatos duráveis são informações declaradas pela pessoa com provável utilidade em conversas futuras, como preferências, função ou contexto profissional persistente; inferências não declaradas não são aprendidas.
- O aprendizado é disparado somente depois de uma resposta bem-sucedida e usa a mensagem mais recente da pessoa associada àquela resposta.
- Falhas no processo assíncrono são registradas para diagnóstico; não são retroativamente comunicadas como falha da resposta já entregue.
- O `userId` existente é a identidade usada para isolar memórias; autenticação e estabelecimento confiável dessa identidade pertencem ao fluxo existente.
- A ferramenta de esquecimento pode pedir esclarecimento antes da remoção quando o pedido não identifica um alvo único com segurança.
- Esta feature amplia a memória semântica existente; as regras de armazenamento, deduplicação e recuperação previamente definidas continuam válidas.
