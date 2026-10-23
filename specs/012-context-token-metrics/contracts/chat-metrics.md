# Contract: `POST /chat` metrics

Request unchanged. Response `metrics` adds:

```json
{
  "llmCalls": 2, "latencyMs": 1234, "historyMessages": 4,
  "promptTokens": 1850,
  "contextBreakdown": { "system": 0, "summary": 50, "history": 400, "memories": 75, "message": 12 }
}
```

- `promptTokens`: real provider-reported total for the turn; omitted when unavailable.
- `contextBreakdown`: estimated (ceil(chars/4)); all five keys always present.

# Contract: `conversa-longa.sh`

Env: `BASE_URL` (default `http://localhost:3000`), `TURNS` (default 10). Output one line per turn: `turno <n> promptTokens=<int|n/a>`; failed turn prints `turno <n> erro=<status>` and continues.
