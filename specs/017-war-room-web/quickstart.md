# Quickstart: War Room Web

Este guia valida os contratos da API, o cliente do navegador, decisões de ações pendentes e o caminho de publicação sem exigir chamadas reais a modelos nos testes automatizados.

## Prerequisites

- Node.js 22 LTS e dependências instaladas com `npm ci`.
- Para conversa manual ao vivo, a configuração do provedor de modelos da API deve estar disponível por configuração local segura. Não coloque credenciais em variáveis do frontend.
- A allowlist CORS da API deve conter a origem do frontend. Para o Vite local, configure `CORS_ORIGIN=http://localhost:5173`.
- A API persiste ações no SQLite configurado por `OPSPILOT_DB` (ou em `./data/opspilot.db`); use um caminho gravável no ambiente local.

## Validação automatizada

Na raiz do repositório:

```sh
npm run typecheck
npm test
npm run build:web
```

Para inspecionar o build localmente, use `npm run preview:web`.

Resultados esperados:

- As verificações TypeScript da API e do frontend passam.
- Os testes Node validam chat 200 normal, respostas 202 com ações pendentes, aprovar/negar, conflitos, preflight/política de origem CORS, traces tipados, validação de URL e transições de estado do navegador.
- Testes de persistência SQLite usam `:memory:` e fakes determinísticos de serviço/ação; não são necessárias chamadas a modelos externos ou à rede.
- O Vite produz arquivos estáticos com referências de recursos sob `/opspilot/`.

## Fluxo manual no navegador

1. Inicie API e frontend em terminais separados com os comandos documentados `npm run dev` e `npm run dev:web`.
2. Abra a URL de desenvolvimento do Vite e use a engrenagem para configurar o endereço-base da API, por exemplo `http://localhost:3000`.
3. Envie uma mensagem. Confirme que a mensagem e a resposta aparecem; selecione **Ver raciocínio** e confira que o trace tipado e ordenado correspondente é aberto.
4. Solicite uma operação de incidente que retorne HTTP 202. Confirme que aparece um cartão por ação em `pending` e que nenhuma operação é apresentada como concluída antes da decisão.
5. Aprove uma ação pendente e negue outra. Confirme que a UI exibe apenas o resultado confirmado pela API. Repita a mesma decisão e confirme que não há nova execução; tente a decisão oposta e confirme que o conflito fica visível.
6. Recarregue a sala enquanto uma ação aguarda decisão. Confirme que `GET /actions?userId=...` restaura o cartão. A decisão usa `POST /actions/:id/decision`; se o processo da API for reiniciado durante uma execução, confirme que o estado `reconciliation_required` aparece com os controles desabilitados e sem repetir automaticamente a mutação.
7. Informe uma URL inválida e confirme que ela é rejeitada. Restaure uma URL válida, recarregue e confirme que URL, ID anônimo e contexto da conversa permanecem associados àquela API.
8. Teste uma origem de API não permitida e uma falha de rede. Confirme que a UI não mostra falso sucesso de chat ou decisão e apresenta um erro genérico de conexão/configuração.

## Verificação de publicação estática

Compile o frontend e use o comando de preview do Vite para inspecioná-lo sob `/opspilot/`. O build estático fica em `web/dist`; confirme que navegação direta e atualização nesse caminho carregam a aplicação e seus recursos. O preview do Vite serve para validação; a hospedagem de produção deve servir esse diretório sob `/opspilot/` e configurar separadamente o `CORS_ORIGIN` exato da API.

## Casos de borda

- Uma ação 202 incompleta com `status: pending` permanece visível com explicação e controles desabilitados; campos fora da allowlist tipada não são exibidos.
- Um trace vazio ou malformado não exibe eventos de outra interação.
- Conflito ou falha de decisão no servidor permanece visível como pendente/erro e nunca é convertido em estado de ação aprovada.
- A permissão CORS limita-se à origem configurada; alterar o endereço de API no navegador não altera a autorização do servidor.
