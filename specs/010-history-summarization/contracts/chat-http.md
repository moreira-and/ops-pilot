# Chat HTTP Contract Changes: History Summarization

Extends the `POST /chat` contract from [007](../../007-conversation-persistence/contracts/chat-http.md). Request shape is unchanged.

## Response changes

- `metrics.historyMessages` is now `0..8` (was `0..12`): the number of recent messages in the window.
- `trace` may contain a new event, only when a summarization ran during this request:

```json
{
  "sequence": 5,
  "type": "summarize",
  "conversationId": "opaque-conversation-id",
  "messagesSummarized": 8,
  "summarizedThrough": 16
}
```

- The summary text itself is not returned to the client.

## Behavior

| Situation | Result |
|-----------|--------|
| Fewer than 8 newly expired messages since last summary | No summarization, no `summarize` event |
| 8 or more newly expired messages | One summarization, one `summarize` event |
| Summarizer fails | `200 OK` as usual, no `summarize` event, prior summary retained |
