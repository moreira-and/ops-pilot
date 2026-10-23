# Quickstart: Conversation History Summarization

## Prerequisites

- Node.js 22, dependencies installed (`npm install`).
- No network or API keys needed; tests use a fake summarizer and `:memory:` SQLite.

## Validate

```bash
npm run typecheck
npm test
```

## Scenarios covered by the tests

1. **Below threshold**: conversation with ≤ 15 total messages → summarizer never called, no `summarize` event.
2. **First summary**: 16 stored messages, new request → summarizer called once with the 8 expired messages and no previous summary; row saved with `summarized_through = 8`; summary appears in the strategy input; response trace contains `summarize`.
3. **Merge**: 8 more messages expire → summarizer receives the previous summary plus the new batch; stored summary replaced; `summarized_through = 16`.
4. **No repeat**: repeated requests without 8 new expirations → zero additional summarizer calls.
5. **Failure**: fake summarizer throws → response still `200`, prior summary retained, no event.
6. **Bounds**: summarizer output over 900 characters is rejected and treated as a failure.

See [data-model.md](./data-model.md) and [contracts/chat-http.md](./contracts/chat-http.md).
