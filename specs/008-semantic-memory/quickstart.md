# Quickstart: Semantic Memory Validation

## Prerequisites

- Node.js 22.13+ (for normal built-in SQLite operation) or newer supported runtime for the project
- Dependencies installed with `npm install`
- The first semantic integration run may need network access to download the model, unless the model assets are already cached.

## Validation

1. Run the focused type check and test suite:

   ```bash
   node --import tsx --test \
     src/memory/embeddings.test.ts \
     src/memory/memory-store.test.ts \
     src/store/sqlite-memory-store.test.ts \
     src/services/chat-service.test.ts \
     src/http/server.test.ts
   npm run typecheck
   npm test
   ```

2. Run SQLite memory-store tests against an in-memory database. Verify that facts persist, 1,536-byte little-endian Float32 BLOBs round-trip, deduplication is scoped by `user_id`, recall selects the top three before filtering scores `<= 0.3`, and forget cannot remove another user's record.

3. Run the semantic integration test with the production encoder. Remember a fact such as a user's preferred fallback region, then query using a paraphrase with no shared content words. Verify that recall includes the fact and ranks it strictly above `0.3`.

   ```bash
   OPSPILOT_RUN_MODEL_TESTS=1 node --import tsx --test \
     src/memory/semantic-recall.integration.test.ts
   ```

4. Run the HTTP tests with an injected memory store/encoder:
   - A valid `/chat` request with `userId` supplies the recalled fact in strategy context.
   - A request with missing or blank `userId` returns `400` before strategy execution or memory access.
   - An empty eligible recall still allows normal chat completion.
   - An embedding/store failure produces an error response without a successful chat answer.

5. To exercise the real model-backed server manually, start the app with its configured database path and send a valid `POST /chat` request containing `message` and `userId`. Confirm that repeated requests by the same ID use the same memory scope and a different ID does not receive those facts.

See [data-model.md](./data-model.md) for persistence and operation rules and [contracts/chat-http.md](./contracts/chat-http.md) for request and error semantics.
