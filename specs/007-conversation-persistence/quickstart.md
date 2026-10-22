# Quickstart: Persistent Conversations

## Prerequisites

- Node.js 22 LTS and the project dependencies are installed.
- No model credentials or external network service are required for these test scenarios.

## Validate SQLite persistence

Run the conversation-store tests with an isolated in-memory database:

```sh
node --import tsx --test src/store/sqlite-conversation-store.test.ts
```

Expected outcomes:

- The store initializes its schema in `:memory:`.
- Created conversation IDs are distinct.
- Appended user and assistant messages are retrieved in chronological order.
- Retrieval is limited to the newest 12 messages, and unknown conversation IDs are distinguishable from empty conversations.

## Validate chat composition and HTTP behavior

Run the deterministic service and HTTP tests with injected fake stores and strategies:

```sh
node --import tsx --test src/services/chat-service.test.ts src/http/server.test.ts
```

Expected outcomes:

- A request without a conversation ID starts a conversation and returns its ID.
- A valid ID continues that conversation; unknown IDs produce an explicit not-found response.
- The strategy receives the current message and up to 12 chronologically ordered, role-labeled prior messages.
- `metrics.historyMessages` equals the number of prior messages in the composed input.
- Store failures do not produce successful chat responses.

## Run project quality gates

```sh
npm run typecheck
npm test
```

Expected outcomes: TypeScript completes without errors and all `node:test` tests pass.

For the request and response field definitions and error statuses, see [the HTTP contract](./contracts/chat-http.md). For persisted entities and store semantics, see [the data model](./data-model.md).
