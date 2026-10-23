# Research: Semantic Memory

## Embedding model and lazy initialization

**Decision**: Use the `@huggingface/transformers` feature-extraction pipeline with `onnx-community/all-MiniLM-L6-v2-ONNX`, `pooling: "mean"`, `normalize: true`, and explicit `dtype: "fp32"`. Create one lazy module-level pipeline promise in `src/memory/embeddings.ts`; reuse it for remembering facts and embedding chat queries. Cache the promise so concurrent first calls share initialization, clear it on initialization failure so a later call can retry, and pin the model revision used by the application. Keep the encoder behind an injectable function/interface for tests.

**Rationale**: The current Transformers.js feature-extraction documentation uses this ONNX model and returns 384-dimensional float32 embeddings. Mean pooling and L2 normalization produce comparable sentence vectors; with normalized vectors, the dot product is cosine similarity, matching the specified thresholds. Lazy singleton initialization avoids loading the model for processes that do not use memory and avoids repeated model setup in a process.

**Alternatives considered**:

- Load the model eagerly during server startup; rejected because it adds startup work and makes unrelated application functions depend on model initialization.
- Use an external embedding API; rejected because the request specifies local Transformers.js inference and an external service would introduce network, credentials, and availability dependencies.
- Use lexical overlap for recall; rejected because it cannot satisfy the required paraphrase case with no shared words.

**Operational note**: The first inference may need to download model assets unless they are already cached. The model truncates inputs beyond 256 word pieces; facts and queries must use the same supported input policy, and long facts should not be silently assumed to have full-text coverage. Model initialization and inference errors must propagate to the caller; chat must not silently omit recall after an encoder error.

## Vector representation and similarity

**Decision**: Encode each normalized vector as exactly 384 little-endian Float32 values (1,536 bytes) in the SQLite BLOB column. Convert explicitly rather than relying on platform endianness or `Buffer.from(Float32Array)` value conversion. Verify BLOB length, dimensions, and finite decoded values at the store boundary; calculate dot products over equal-length normalized vectors. Deduplication uses a strict `> 0.92` comparison. Recall sorts descending, slices the first `k` candidates (maximum three), then retains only scores strictly greater than `0.3`, matching the supplied reference.

**Rationale**: A fixed-width float representation is compact (1,536 bytes per vector) and avoids JSON parsing overhead. Node's built-in SQLite accepts typed-array/ArrayBuffer views as BLOB input and returns BLOB data as `Uint8Array`. Explicit little-endian encoding makes the persisted format unambiguous. The requested normalized vectors make a dot product directly comparable to the cosine-similarity thresholds. Strict boundary operators preserve the feature's stated threshold semantics.

**Alternatives considered**:

- Store vectors as JSON text; rejected because it is larger, requires parsing on every recall, and does not match the requested BLOB.
- Add a vector database/index; rejected because top-3 retrieval can be performed over the current user's records and no scale requirement justifies a new service.
- Apply deduplication at `>= 0.92`; rejected because the user specified `> 0.92`.
- Depend on native `Float32Array` byte order; rejected because the persisted BLOB format should be explicit and portable.

Embedding compatibility is tied to the selected model ID/revision, dimensions, pooling, normalization, and binary format. If any of these change, existing vectors must be re-embedded or kept in a separate vector space.

## SQLite persistence

**Decision**: Add a `memories` table to the active SQLite database, with the specified columns `id`, `user_id`, `fact`, `embedding`, and `created_at`, plus a `user_id` index. Use `DatabaseSync`, idempotent static DDL, prepared statements, and bound parameters. Use the existing `OPSPILOT_DB` path in production and `:memory:` in store tests.

**Rationale**: The active stores use Node's built-in SQLite API and initialize their schema from static DDL. This follows the project constitution and avoids a separate service or migration framework for an embedded database.

The per-user duplicate check and conditional insert execute as one transaction after embedding completes, so concurrent writes cannot both pass the check and insert equivalent facts.

**Alternatives considered**:

- Use the legacy Sequelize/MySQL migration layer; rejected because the active API persistence path is SQLite and the constitution requires embedded SQLite.
- Interpolate input values into SQL; rejected because it violates the constitution's prepared-statement and bound-value requirement.

## Chat integration and identity boundary

**Decision**: Make `userId` a required, non-empty trimmed field in `POST /chat`. Extend chat orchestration to recall for that user and pass the retrieved facts alongside the current message to the existing prompt-composition seam. Keep `remember`, `recall`, and `forget` as application/service operations; do not add public memory-management HTTP endpoints in this feature.

**Rationale**: The request explicitly adds `userId` to `/chat` and asks for a user-scoped MemoryStore. Existing chat input is validated by Zod in the Express boundary and its reasoning strategy can receive composed context without changing its public reasoning interface.

**Alternatives considered**:

- Make memory APIs public HTTP endpoints; rejected because the request does not specify endpoint paths or response contracts.
- Trust memory failures as an empty recall; rejected because it would hide storage/model errors and create a success-shaped result with incomplete context.
- Add authentication and identity issuance; deferred because the existing service has no authentication mechanism and the spec explicitly treats identity establishment as outside this feature.

## Sources

- Hugging Face Transformers.js documentation: https://huggingface.co/docs/transformers.js/index
- Transformers.js feature-extraction API: https://huggingface.co/docs/transformers.js/en/api/pipelines
- Transformers.js pipeline loading options: https://huggingface.co/docs/transformers.js/en/pipelines
- Transformers.js Node tutorial: https://huggingface.co/docs/transformers.js/en/tutorials/node
- Transformers.js package documentation: https://github.com/huggingface/transformers.js
- all-MiniLM-L6-v2 ONNX model card: https://huggingface.co/onnx-community/all-MiniLM-L6-v2-ONNX
- all-MiniLM-L6-v2 model card: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- Sentence Transformers similarity guidance: https://www.sbert.net/docs/sentence_transformer/usage/semantic_textual_similarity.html
- Node.js v22 SQLite API: https://nodejs.org/docs/latest-v22.x/api/sqlite.html
- Node.js SQLite type conversion: https://nodejs.org/api/sqlite.html#type-conversion-between-javascript-and-sqlite
- Node.js Buffer API: https://nodejs.org/api/buffer.html#bufwritefloatlevalue-offset
- SQLite storage classes: https://www.sqlite.org/datatype3.html
- Existing SQLite patterns: `src/store/sqlite-ops-store.ts`, `src/store/sqlite-conversation-store.ts`, and `specs/004-operational-persistence/research.md`
