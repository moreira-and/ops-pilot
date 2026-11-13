# Research: War Room Web

## Vite sob `/opspilot/`

**Decision**: Criar a aplicação em `web/` e definir a base pública Vite como `/opspilot/`. Usar `import.meta.env.BASE_URL` para URLs de recursos montadas dinamicamente. Publicar o diretório de build sob esse caminho e validar navegação direta e atualização com o servidor estático de preview.

**Rationale**: O caminho é fixo no requisito. A documentação do Vite explica que `base` reescreve referências de assets em HTML, CSS e JavaScript durante o build, e que `BASE_URL` serve para URLs dinâmicas. Vite Preview é adequado para validar o build, mas não é um servidor de produção.

**Alternatives considered**:

- Base relativa `./`: rejeitada porque o requisito fixa o caminho e URLs relativas tornariam a resolução de assets dependente da localização de cada página.
- Ajustar a base por ambiente: rejeitado nesta feature porque não há múltiplos caminhos de publicação especificados.
- Fazer o Express servir `web/dist`: rejeitado porque não há requisito de hospedagem estática no mesmo processo, e o endereço da API deve permanecer configurável.

Fonte: [Vite — Public Base Path](https://vite.dev/guide/build.html#public-base-path), [Vite — Static Deploy](https://vite.dev/guide/static-deploy.html).

## React e TypeScript no cliente

**Decision**: Usar arquivos `.tsx` para componentes e um `tsconfig` próprio do frontend, preservando o `tsconfig.json` existente da API. Compartilhar somente schemas de contrato puros, sem importar agentes ou dependências de runtime exclusivas do servidor para o bundle.

**Rationale**: A documentação do React confirma que JSX com TypeScript usa a extensão `.tsx` e depende dos tipos de React e React DOM. Separar o tsconfig evita alterar o `rootDir` restrito à API; os schemas compartilhados mantêm o trace e as respostas validados sem duplicar os contratos.

**Alternatives considered**:

- Converter o `tsconfig.json` da API em um projeto frontend/backend conjunto: rejeitado porque mudaria as fronteiras de compilação existentes sem benefício para o requisito.
- Duplicar tipos de resposta e trace no navegador: rejeitado por permitir divergência entre API e UI.

Fonte: [React — Using TypeScript](https://react.dev/learn/typescript).

## Endereço-base configurável e estado local

**Decision**: Validar a URL informada pelo operador com `URL` e Zod; aceitar apenas `http:` e `https:` e normalizar a junção dos caminhos de operação sem descartar um prefixo configurado. Guardar a URL, o UUID anônimo do navegador e o `conversationId` ativo no `localStorage`, associados ao endereço da API. Um valor opcional `VITE_API_BASE_URL` serve somente como valor inicial público; não é fonte da configuração salva nem local para credenciais.

**Rationale**: Variáveis `VITE_*` são incluídas no bundle e não podem conter segredos nem permitir configuração por operador em runtime. A API atual exige `userId` e suporta `conversationId`; um identificador aleatório estável por navegador atende ao contrato sem alegar autenticação. Associar a conversa à URL evita enviar um ID de conversa de um ambiente a outro.

**Alternatives considered**:

- Usar somente `VITE_API_BASE_URL`: rejeitado porque o operador não poderia trocar a API sem novo build.
- Guardar credenciais no bundle ou no `localStorage`: rejeitado; esta feature não implementa autenticação.
- Gerar um `userId` diferente a cada mensagem: rejeitado porque fragmentaria a continuidade e os dados de usuário já associados ao contrato de chat.

Fonte: [Vite — Env Variables and Modes](https://vite.dev/guide/env-and-mode.html).

## CORS e limites de segurança no navegador

**Decision**: Usar o middleware Express `cors` com uma allowlist exata de origem por `CORS_ORIGIN`, aceitar a origem de desenvolvimento `http://localhost:5173` apenas em desenvolvimento e a origem de publicação explicitamente configurada. Permitir os métodos usados pelo cliente (`GET`, `POST`, `OPTIONS`) e o cabeçalho `Content-Type`; não habilitar credenciais nem usar `*`. Mostrar erros de rede de forma genérica e orientada à configuração, pois o JavaScript não recebe detalhes específicos de uma falha CORS.

**Rationale**: A origem inclui esquema, host e porta, mas não o caminho `/opspilot/`. O `POST` JSON causa preflight; o servidor deve responder a `OPTIONS` e permitir o método e os cabeçalhos da solicitação real. CORS só controla quais scripts de navegador podem ler respostas: não autentica operadores nem restringe clientes não-browser. A implantação deve proteger o acesso à API por controles externos, conforme a decisão do usuário de não incluir login nesta feature.

**Alternatives considered**:

- `Access-Control-Allow-Origin: *`: rejeitado porque a API contém operações operacionais e a origem deve ser deliberadamente autorizada.
- Proxy de desenvolvimento do Vite: pode simplificar desenvolvimento, mas não substitui CORS na publicação nem atende a um endereço de API configurável.
- `mode: "no-cors"` no cliente: rejeitado porque respostas opacas não permitem ler JSON, status ou trace.
- Exibir uma mensagem específica “erro CORS”: rejeitado porque o navegador não expõe à aplicação os detalhes desse bloqueio; a UI apresenta uma falha de conexão e oferece a URL configurada para inspeção.

Fontes: [MDN — CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS), [Vite — Server Options / Proxy](https://vite.dev/config/server-options.html#server-proxy).

## Contrato de aprovação e compatibilidade com a API existente

**Decision**: Preservar a resposta 200 atual de `POST /chat` e marcar o registro de execução como concluído quando a conversa termina, independentemente do ciclo de vida da ação. Quando houver uma ou mais ações pendentes, responder 202 com o resultado do chat, o trace tipado e a lista das ações não executadas. Criar `GET /actions?userId=...` para restaurar ações ativas ao recarregar e `POST /actions/:id/decision` para aprovar ou negar cada ação. Persistir ações no SQLite e autorizar a execução somente depois de uma decisão `approve`; rejeições não executam a operação. Uma mesma decisão repetida retorna o resultado registrado sem repetir a operação; decisão oposta em ação terminal retorna conflito. Na inicialização, ações encontradas em `processing` passam a `reconciliation_required`; o sistema não as executa novamente automaticamente.

**Rationale**: A API atual já valida o chat com Zod, retorna resposta/trace/métricas, requer `userId` e persiste traces; não há resposta 202, estado de aprovação ou CORS. As ferramentas `open_incident` e `resolve_incident` executam mutações diretamente, portanto devem produzir ações pendentes na configuração usada pela API web antes de qualquer efeito operacional. A listagem pelo `userId` restaura cartões após recarga. Estado de processamento interrompido não permite repetição automática de uma mutação cujo resultado possa ser ambíguo. Tools de leitura permanecem como estão; `forget_preference` só é chamada mediante pedido explícito existente e não passa a exigir uma segunda confirmação.

**Alternatives considered**:

- Implementar apenas o cartão no frontend: rejeitado porque o servidor atual nunca retorna 202 e não tem operação para registrar uma decisão ou restaurar ações pendentes.
- Executar a mutação antes de devolver 202: rejeitado porque o cartão deixaria de oferecer controle humano prévio.
- Alterar o contrato de sucesso 200 existente: rejeitado para preservar as integrações atuais e limitar 202 às respostas com ação pendente.
- Aplicar aprovação a ferramentas de leitura: rejeitado porque não causam as mutações operacionais cobertas por esta feature.

Referências locais: `src/http/server.ts` (contrato atual de `/chat`, `/requests/:id` e `/status`), `src/agents/reasoning.ts` (união Zod de `TraceEvent`), `src/agents/tools.ts` (ferramentas de incidente e outras ferramentas), `specs/007-conversation-persistence/contracts/chat-http.md` e `specs/015-persisted-trace/contracts/request-trace.md`.

## Testes e comandos do projeto

**Decision**: Continuar usando `node:test` via `tsx`. Testar cliente, schemas e transições da UI por módulos puros; testar CORS, 200/202, decisões, concorrência e persistência com testes HTTP e stores SQLite `:memory:`. Incluir os testes `web/` no comando raiz sem trocar o runner. Validar o frontend com typecheck separado e build Vite; descrever os fluxos visuais e a publicação estática no quickstart.

**Rationale**: O repositório não tem runtime DOM ou biblioteca de testes React instalada, e sua convenção exige `node:test`. Testes de contrato e estado cobrem entradas, respostas, decisões e erros sem rede; a inspeção manual documentada valida o fluxo visual sem introduzir um segundo test runner.

**Alternatives considered**:

- Introduzir Vitest como runner separado: rejeitado para manter o runner e os comandos de qualidade existentes.
- Tratar somente o build como teste da UI: rejeitado porque build não valida transições de estado, contratos nem erros.
