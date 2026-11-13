# Feature Specification: GitHub Pages Deployment

**Feature Branch**: `[018-github-pages-deploy]`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "Deploy do web/ no Pages via Actions:
upload-pages-artifact + deploy-pages, permissions, README (atualizar)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publicar a sala de plantão (Priority: P1)

Como mantenedor do OpsPilot, quero que a versão web aprovada seja publicada automaticamente no GitHub Pages, para que operadores possam abrir a War Room sem compilar ou hospedar os arquivos manualmente.

**Why this priority**: Sem uma publicação repetível, a interface existe apenas no repositório e não pode ser usada pelos operadores.

**Independent Test**: Envie uma alteração à branch padrão e confirme que a execução de publicação termina com sucesso, apresenta a URL do Pages e carrega a sala com seus recursos estáticos.

**Acceptance Scenarios**:

1. **Given** uma alteração enviada à branch padrão, **When** a verificação de publicação termina com sucesso, **Then** a versão web produzida é publicada no GitHub Pages e a execução informa sua URL.
2. **Given** uma pull request para a branch padrão, **When** as verificações de publicação são executadas, **Then** a compilação é validada sem publicar uma versão do Pages.
3. **Given** uma publicação iniciada manualmente na branch padrão, **When** a execução termina com sucesso, **Then** a mesma versão web é disponibilizada no Pages.
4. **Given** que a compilação ou o envio do artefato falha, **When** a execução termina, **Then** a publicação é marcada como falha e nenhum sucesso de deploy é informado.
5. **Given** uma execução manual solicitada a partir de outra branch, **When** a ação é iniciada, **Then** ela não publica o site.
6. **Given** duas alterações aprovadas publicadas em sequência, **When** suas execuções se sobrepõem, **Then** a versão final do Pages corresponde à alteração mais recente.

### User Story 2 - Entender e manter a publicação (Priority: P2)

Como mantenedor, quero encontrar no README o endereço publicado, o comportamento da automação e os requisitos de configuração, para que eu possa verificar ou recuperar a publicação sem depender de conhecimento tácito.

**Why this priority**: A publicação precisa ser operável por outros mantenedores e não pode depender de instruções dispersas.

**Independent Test**: Siga apenas a seção de publicação do README para identificar a URL do Pages, os eventos que publicam, as permissões necessárias e a configuração CORS correspondente na API.

**Acceptance Scenarios**:

1. **Given** que um mantenedor abre o README, **When** consulta a seção da War Room, **Then** encontra a URL publicada e os passos para habilitar e acompanhar a publicação.
2. **Given** que o operador configura a conexão da interface, **When** consulta o README, **Then** encontra a origem exata que deve ser autorizada por CORS na API, sem instruções para expor segredos no site estático.
3. **Given** que o mantenedor precisa validar uma alteração localmente, **When** segue os comandos documentados, **Then** consegue compilar e visualizar o mesmo conteúdo estático antes do deploy.

### Edge Cases

- Uma execução manual iniciada em uma branch diferente da branch padrão não deve publicar conteúdo não aprovado.
- Execuções simultâneas não devem fazer uma versão antiga substituir silenciosamente uma publicação mais recente.
- Uma falha de build, artifact upload, configuração de Pages ou deploy deve deixar uma execução identificável como falha.
- O caminho público do site e os caminhos dos assets devem coincidir; abrir diretamente a página ou atualizá-la não pode resultar em assets ou rota não encontrados.
- O artefato de publicação não deve incluir credenciais, arquivos de ambiente, dependências de desenvolvimento ou o backend da API.
- O Pages publica somente a interface estática; a API continua sendo uma implantação separada e precisa autorizar a origem do site por CORS.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O projeto MUST compilar a interface web existente em um artefato estático de publicação, sem incluir o backend ou arquivos não destinados ao navegador.
- **FR-002**: O projeto MUST validar a compilação em pull requests direcionadas à branch padrão sem publicar o site.
- **FR-003**: O projeto MUST publicar automaticamente uma compilação aprovada após alterações na branch padrão e MUST permitir iniciar a mesma publicação manualmente a partir dessa branch.
- **FR-004**: A publicação MUST usar `actions/upload-pages-artifact` para transferir o artefato estático e `actions/deploy-pages` para implantá-lo no ambiente Pages. O job de deploy MUST conceder apenas `contents: read`, `pages: write` e `id-token: write`; a validação de pull request MUST limitar-se a `contents: read`.
- **FR-005**: A configuração do endereço-base público da interface MUST corresponder à URL padrão do projeto no Pages, `https://moreira-and.github.io/ops-pilot/`, incluindo o segmento `/ops-pilot/` nos caminhos da aplicação e dos assets.
- **FR-006**: Uma falha de compilação, upload ou deploy MUST ser apresentada como falha da execução e MUST NOT ser apresentada como publicação concluída.
- **FR-007**: O README MUST documentar a URL de publicação, os eventos de validação e deploy, o fluxo de configuração do Pages, a validação local e a configuração CORS necessária na implantação separada da API.
- **FR-008**: O artefato publicado MUST conter somente arquivos estáticos necessários para a interface e MUST NOT incluir segredos, arquivos `.env`, dependências ou código de servidor.
- **FR-009**: Publicações concorrentes MUST ser serializadas ou substituídas de modo que uma versão mais antiga não se torne a versão final depois de uma mais recente.

### Key Entities *(include if feature involves data)*

- **Execução de publicação**: Resultado de validar ou publicar uma versão, incluindo branch de origem, estado, URL e informações de falha.
- **Artefato estático**: Arquivos compilados da interface que são transferidos para a hospedagem Pages.
- **Configuração de publicação**: Branch autorizada, URL pública, permissões e ambiente associados ao site.
- **Instruções de operação**: Informações no README que permitem aos mantenedores configurar, validar e acompanhar o site.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em uma alteração aprovada na branch padrão, a nova versão fica disponível na URL do Pages em até 10 minutos após o início da execução de publicação.
- **SC-002**: Em 100% das verificações de pull request, a interface é compilada sem que uma publicação do Pages seja iniciada.
- **SC-003**: Em 100% dos testes de publicação, uma falha de compilação ou transferência termina em estado de falha e não é comunicada como deploy bem-sucedido.
- **SC-004**: Em 100% dos testes de navegação, a URL publicada e seus assets carregam tanto na abertura direta quanto após atualizar a página.
- **SC-005**: Um mantenedor consegue identificar no README a URL do site, a origem CORS exigida e o fluxo de recuperação em até 3 minutos.
- **SC-006**: Nenhum arquivo secreto ou código do backend aparece no artefato destinado ao Pages.

## Assumptions

- A branch padrão do repositório é `main`.
- O GitHub Pages do repositório está habilitado para receber publicações por GitHub Actions; a configuração inicial do repositório pode exigir uma ação de um mantenedor.
- A publicação usa a URL padrão do projeto `https://moreira-and.github.io/ops-pilot/`, sem domínio personalizado.
- A publicação automatiza apenas a interface estática existente; API, banco de dados e segredos permanecem fora do Pages.
- O fluxo solicitado usa `actions/upload-pages-artifact` e `actions/deploy-pages`, com permissões restritas ao necessário para publicação.
- Pull requests executam validações, mas somente alterações aprovadas na branch padrão podem publicar.
- A origem da interface para a configuração CORS da API é `https://moreira-and.github.io`; CORS permanece configurado na implantação separada da API.
