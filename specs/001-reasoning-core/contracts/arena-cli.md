# Arena CLI Contract

## Invocation

```text
npm run arena -- --input "<operational request>" [--strategies react,plan-and-execute] [--max-iterations <positive integer>]
```

## Arguments

| Option | Required | Default | Validation |
|--------|----------|---------|------------|
| `--input` | Yes | — | Non-empty string |
| `--strategies` | No | `react` | Comma-separated non-empty subset of `react`, `plan-and-execute`; unknown or duplicate names are rejected |
| `--max-iterations` | No | `8` | Positive integer |

Invalid arguments are reported before model construction or strategy execution. Missing model settings are reported explicitly when the model is initialized. The demonstration JSON is loaded into memory; the arena does not require database settings.

## Output

Print one clearly labeled result per selected strategy in the requested order. Each result includes the answer, ordered typed trace, `llmCalls`, and `latencyMs`. A strategy failure is identified as a failure and must not be formatted as a successful answer. The process exits unsuccessfully for invalid CLI input or if no selected strategy can produce a result.

Strategies receive the exact same input text and configured iteration bound. The arena runs them sequentially in one process against the shared in-memory store; successful tool mutations may affect later strategies in the same invocation but are discarded when the process exits.
