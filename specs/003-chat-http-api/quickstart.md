# Quickstart: API HTTP do Chat

## Prerequisites

- Node.js 22 LTS
- Dependencies installed with `npm install`

The integration tests inject deterministic fake strategies. They do not need `.env`, database credentials, OpenRouter credentials, or external network access.

## Validate the feature

Run the focused HTTP integration test:

```sh
node --import tsx --test src/http/server.test.ts
```

Expected outcomes:

- A valid request with omitted `strategy` selects `react` and returns `200` with `answer`, `trace`, and `metrics`.
- A registered alternate strategy is selected by name; `reflact: true` executes the reflected strategy path.
- Missing or invalid fields return `400` with Zod issues.
- Malformed JSON returns `400`; unexpected failures and invalid strategy results return `500`, never a success-shaped response.
- An unknown strategy returns `422` without invoking a strategy.
- A fake strategy exceeding the injected short test deadline returns `504`; production uses 180 seconds.

Run repository quality gates:

```sh
npm run typecheck
npm test
```

For request and response schemas and error status details, see [contracts/chat-http.md](./contracts/chat-http.md). For the registry, validation, and execution data, see [data-model.md](./data-model.md).
