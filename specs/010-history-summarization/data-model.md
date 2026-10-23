# Data Model: Conversation History Summarization

## conversation_summaries

| Column | Type | Constraints |
|--------|------|-------------|
| `conversation_id` | TEXT | PRIMARY KEY, FK → `conversations(id)` |
| `summary` | TEXT | NOT NULL, `length(trim(summary)) > 0`, `length(summary) <= 900` |
| `summarized_through` | INTEGER | NOT NULL, `> 0`; highest `messages.sequence` included in the summary |
| `updated_at` | TEXT | NOT NULL (ISO timestamp) |

One row per conversation (upsert). Write guard: only update when the new `summarized_through` is greater than the stored one.

## ConversationSummary (Zod)

`{ conversationId: string, summary: string (1..900), summarizedThrough: int > 0, updatedAt: Date }`

## Pruning plan (pure)

Input: `{ totalMessages, summarizedThrough }` (constants: WINDOW = 8, BATCH = 8).
Output: `null` or `{ fromSequence, toSequence }` where `toSequence = totalMessages - WINDOW` and `fromSequence = summarizedThrough + 1`, returned only if `toSequence - summarizedThrough >= BATCH`.

## State transitions

`no summary (through=0)` → (8 expired) → `summary(through=8)` → (8 more expired) → `summary(through=16)` …; failures leave state unchanged.

## Trace event `summarize`

`{ sequence, type: "summarize", conversationId, messagesSummarized: int > 0, summarizedThrough: int > 0 }`
