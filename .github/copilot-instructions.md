# OpsPilot

OpsPilot é um copiloto de plantão para alertas e incidentes de produção. A API é um agente LangChain/LangGraph conectado ao OpenRouter.

## Stack

- Node.js 22 LTS; TypeScript ESM com `strict: true`.
- Express, Sequelize e MySQL.
- Zod valida entradas e saídas nas fronteiras HTTP e CLI.
- Testes com `node:test` via `tsx`.

## Comandos

- `npm run dev`
- `npm run arena`
- `npm run bench`
- `npm run typecheck`
- `npm test`

## Convenções

- Use as camadas MVC: Model, Service e Controller.
- Valide toda entrada externa e saída de fronteira com Zod.
- Modele erros de domínio como classes e traduza-os na borda.
- Crie testes junto com a lógica nova; mantenha `npm run typecheck` e `npm test` verdes.
- Prefira funções puras e mantenha efeitos colaterais nas fronteiras.
- Nunca versione secrets nem leia o conteúdo de `.env`.
- Siga o fluxo do Spec Kit do GitHub Copilot nesta ordem: `/speckit.specify` -> `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement`. Versione as specs.