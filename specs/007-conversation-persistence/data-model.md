# Data Model: Persistent Conversations

## Conversation

Represents one independently resumable chat.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Required, unique, opaque identifier generated when a new conversation starts |
| `createdAt` | date/time | Required creation time |

Relationships: one conversation has zero or more ordered messages. Conversations are not shared across identifiers.

## Message

Represents one user or assistant entry in a conversation.

| Field | Type | Rules |
|---|---|---|
| `sequence` | integer | Required, monotonically increasing ordering key |
| `conversationId` | string | Required, references an existing conversation |
| `role` | enum | `user` or `assistant` |
| `content` | string | Required, non-empty after trimming |
| `createdAt` | date/time | Required |

### Retrieval and lifecycle rules

- A new conversation is created when a chat request omits `conversationId`.
- A supplied identifier must refer to an existing conversation; otherwise the operation fails explicitly.
- `lastMessages(conversationId, limit)` returns `null` for an unknown conversation and an array for a known conversation, including an empty array if it has no messages.
- History selection is limited to the 12 greatest message sequence values, then ordered from oldest to newest before prompt composition.
- The current request's user message is not part of the history count. The count is the number of prior messages passed to prompt composition.
- The assistant reply is appended only after a successful reasoning result is validated. Persistence failures prevent a successful HTTP response.

## Conversation Store

The application-facing store supports:

| Operation | Input | Result |
|---|---|---|
| `create` | None | A new conversation with its generated ID |
| `append` | Conversation ID, role, content | Persisted message; `role` is `user` or `assistant`, `content` is non-empty after trimming, and the operation fails if the conversation does not exist |
| `lastMessages` | Conversation ID, maximum count | Chronologically ordered recent messages, or `null` when the conversation is unknown |

The SQLite schema enforces message-to-conversation references and the closed message-role values. Query parameters are bound values, not SQL text.
