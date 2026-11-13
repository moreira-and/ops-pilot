# Feature Specification: War Room Web

**Feature Branch**: `017-war-room-web`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "War room web/ (Vite+react+TS) com as instruções de design: chat -> /chat, com "ver raciocínio" abrindo o trace tipado. 202 vira cartão aprovar/negar; engrenagem com URL da API; base /opspilot/; CORS"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conversar com o OpsPilot (Priority: P1)

Como operador de plantão, quero enviar mensagens ao OpsPilot em uma sala de operações web e receber suas respostas, para investigar situações operacionais sem sair do navegador.

**Why this priority**: A conversa é o fluxo principal da sala e permite ao operador obter assistência durante um incidente.

**Independent Test**: Configurar uma API de teste, enviar uma mensagem e confirmar que a resposta aparece na conversa; simular uma falha e confirmar que ela é apresentada como erro, não como resposta do agente.

**Acceptance Scenarios**:

1. **Given** uma conexão válida e uma mensagem preenchida, **When** o operador envia a mensagem, **Then** a sala a exibe e mostra a resposta correspondente quando recebida.
2. **Given** a API retorna uma falha ou não pode ser alcançada, **When** o operador envia uma mensagem, **Then** a sala informa que a operação falhou e não apresenta uma resposta bem-sucedida fictícia.

### User Story 2 - Revisar uma ação proposta (Priority: P1)

Como operador de plantão, quero revisar uma ação que aguarda aprovação e aprová-la ou negá-la explicitamente, para manter o controle humano sobre decisões operacionais.

**Why this priority**: Ações pendentes exigem uma decisão clara do operador e não podem ser confundidas com respostas informativas comuns.

**Independent Test**: Simular uma resposta de ação pendente, verificar o cartão com seus detalhes e confirmar separadamente os resultados de aprovar e negar.

**Acceptance Scenarios**:

1. **Given** uma resposta que indica uma ação pendente, **When** ela aparece na conversa, **Then** a sala exibe um cartão com os detalhes disponíveis e controles identificados para aprovar e negar, sem tratá-la como resposta comum.
2. **Given** uma ação pendente ainda não decidida, **When** o operador escolhe aprovar ou negar, **Then** a sala envia essa decisão para a API e exibe o resultado confirmado por ela.
3. **Given** uma decisão em andamento ou já concluída, **When** o operador interage com o cartão, **Then** a sala impede o envio de decisões duplicadas ou conflitantes.
4. **Given** a API não confirma a decisão, **When** a solicitação falha, **Then** a sala informa a falha e não indica que a ação foi aprovada ou negada.
5. **Given** uma ação continua pendente, **When** o operador recarrega ou reabre a sala no mesmo navegador, **Then** a sala restaura o cartão e permite decidir somente se a API ainda a reportar como pendente.

### User Story 3 - Inspecionar o raciocínio da execução (Priority: P2)

Como operador, quero abrir o trace tipado de uma resposta quando solicito “Ver raciocínio”, para entender os eventos estruturados que levaram àquela resposta.

**Why this priority**: A inspeção do trace dá contexto às respostas do agente e apoia a investigação de situações complexas.

**Independent Test**: Exibir uma resposta com trace estruturado, acionar “Ver raciocínio” e confirmar que o trace correspondente é aberto com os eventos em ordem.

**Acceptance Scenarios**:

1. **Given** uma resposta com trace disponível, **When** o operador aciona “Ver raciocínio”, **Then** a sala abre o trace tipado associado àquela resposta, distinguindo seus eventos estruturados e preservando sua ordem.
2. **Given** um trace vazio ou indisponível, **When** o operador tenta inspecioná-lo, **Then** a sala comunica que não há trace disponível e não mostra dados de outra execução.
3. **Given** o trace está aberto, **When** o operador fecha sua visualização, **Then** a conversa permanece disponível no ponto em que estava.

### User Story 4 - Configurar a conexão com a API (Priority: P1)

Como operador, quero informar o endereço da API nas configurações da sala, para conectar a interface ao ambiente de OpsPilot desejado.

**Why this priority**: A interface não pode atender a diferentes ambientes de operação se o operador não puder definir a API à qual ela se conecta.

**Independent Test**: Abrir as configurações pela engrenagem, salvar um endereço válido, recarregar a sala e confirmar que a conexão usa o endereço salvo; verificar também a apresentação de um endereço inválido.

**Acceptance Scenarios**:

1. **Given** a sala aberta, **When** o operador seleciona a engrenagem, **Then** encontra uma configuração para informar e salvar o endereço-base da API.
2. **Given** um endereço válido salvo, **When** o operador recarrega ou reabre a sala no mesmo navegador, **Then** o endereço permanece configurado e é usado nas próximas interações.
3. **Given** um endereço inválido, **When** o operador tenta salvá-lo, **Then** a sala explica o problema e não o usa para enviar solicitações.
4. **Given** a sala e a API estão em origens diferentes, **When** o operador conversa com a API, **Then** a configuração da API permite a comunicação do navegador a partir da origem autorizada da sala.
5. **Given** a aplicação é publicada sob `/opspilot/`, **When** o operador abre ou recarrega a sala nesse caminho, **Then** a interface e seus recursos continuam acessíveis sem exigir uma publicação na raiz do domínio.

### Edge Cases

- Uma resposta pendente sem detalhes ou identificador suficientes para decidir deve ser apresentada como pendente, com controles de decisão indisponíveis e uma explicação; a sala não deve inventar uma ação.
- Se a ação deixar de estar pendente antes de a decisão ser confirmada, a sala deve exibir o estado retornado pela API e não reapresentar a ação como aprovada ou negada.
- Se um trace não corresponder à resposta exibida, a sala não deve associá-lo a essa resposta.
- Se a conexão falhar por endereço incorreto, indisponibilidade da API ou bloqueio de comunicação entre origens, a sala deve identificar a falha de conexão e manter a configuração editável.
- A navegação direta ou a atualização da página sob o caminho de publicação `/opspilot/` deve continuar carregando a sala.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A sala MUST permitir que o operador envie uma mensagem à operação de chat da API e MUST apresentar a mensagem e a resposta correspondente na conversa.
- **FR-002**: A sala MUST apresentar falhas de solicitação ou conexão como erros explícitos, sem exibi-las como respostas bem-sucedidas.
- **FR-003**: Para cada resposta com trace disponível, a sala MUST oferecer a ação “Ver raciocínio”, que abre o trace tipado associado àquela resposta e preserva a ordem dos eventos fornecidos.
- **FR-004**: A sala MUST informar quando o trace estiver indisponível ou vazio e MUST NOT substituir o trace da resposta por dados de outra execução.
- **FR-005**: Quando a API indicar que uma ação aguarda aprovação, a sala MUST apresentar a resposta como um cartão de ação pendente, distinto de uma resposta comum, com os detalhes disponíveis e opções explícitas para aprovar ou negar.
- **FR-006**: A sala MUST enviar a decisão escolhida para a API e MUST indicar aprovação ou negação somente após confirmação da API.
- **FR-007**: Enquanto uma decisão estiver em andamento ou após sua conclusão, a sala MUST impedir decisões duplicadas ou conflitantes para a mesma ação e MUST apresentar falhas de decisão sem indicar sucesso.
- **FR-008**: A sala MUST oferecer, por meio do controle de engrenagem, uma configuração para informar e salvar o endereço-base da API, validar o endereço antes de usá-lo e reter a configuração em visitas posteriores no mesmo navegador.
- **FR-009**: A sala MUST permitir comunicação pelo navegador com a API configurada quando a origem da API for diferente da origem da interface; a API MUST permitir essa comunicação a partir da origem autorizada da interface.
- **FR-010**: A sala MUST permanecer funcional quando publicada sob o caminho `/opspilot/`, incluindo carregamento direto e atualização nesse caminho.
- **FR-011**: A sala MUST restaurar ações pendentes associadas ao navegador ao reabrir a interface e MUST desabilitar decisões para ações em processamento, falhas ou que exijam reconciliação.

### Key Entities *(include if feature involves data)*

- **Mensagem de chat**: Texto enviado pelo operador e resposta associada, com o trace disponível para aquela execução.
- **Trace tipado**: Sequência ordenada de eventos estruturados fornecidos para uma execução e associados à resposta correspondente.
- **Ação pendente**: Proposta retornada pela API que requer uma única decisão explícita de aprovar ou negar e cujo estado final é confirmado pela API.
- **Configuração da API**: Endereço-base informado pelo operador e retido para uso posterior no mesmo navegador.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pelo menos 95% dos operadores de teste conseguem enviar uma mensagem e identificar a resposta correspondente em até um minuto, sem orientação.
- **SC-002**: Em 100% dos testes com respostas de ação pendente, a interface apresenta um cartão com escolhas explícitas de aprovar e negar, e só exibe uma decisão final depois da confirmação da API.
- **SC-003**: Em 100% dos testes com trace disponível, “Ver raciocínio” abre o trace da execução correta e preserva a ordem recebida dos eventos.
- **SC-004**: Em 100% dos testes com endereço válido salvo, a sala usa esse endereço após recarregar ou reabrir no mesmo navegador; endereços inválidos são rejeitados com uma explicação.
- **SC-005**: Em um ambiente de teste com origens distintas para a sala e para a API, os operadores conseguem completar uma interação sem falha de comunicação entre origens.
- **SC-006**: Em 100% dos testes de publicação sob `/opspilot/`, a sala e seus recursos carregam tanto por navegação direta quanto após atualizar a página.
- **SC-007**: Em 100% dos testes de recarga com ação ainda pendente, o cartão reaparece com controles ativos somente enquanto a API confirmar o estado pendente.

## Assumptions

- Esta feature estende a API de chat para identificar ações que aguardam aprovação, retornar seus detalhes e oferecer operações para aprovar ou negar cada ação.
- Uma resposta de ação pendente fornece detalhes e uma referência suficientes para que a API associe uma decisão de aprovar ou negar à ação correta; a ação só é executada depois de aprovada.
- O endereço configurado pelo operador é o endereço-base da API, e não o endereço de uma operação individual.
- A API pode restringir a comunicação entre origens à origem em que a sala está publicada; não se presume autorização irrestrita para qualquer origem.
- A retenção da configuração é limitada ao mesmo navegador; sincronização entre navegadores e gestão de múltiplos perfis não fazem parte deste escopo.
- A sala gera e retém um identificador anônimo por navegador para atender ao contrato atual de chat; esse identificador não autentica o operador.
- Não há login nesta feature. A implantação deve restringir o acesso à API e às decisões de aprovação por controles de rede ou de infraestrutura; CORS não é um mecanismo de autenticação.
- O público principal é composto por operadores em plantão que acessam a sala por um navegador compatível.
