# Arena CLI Reflection Contract

## Invocation

```text
npm run arena -- --input "<operational request>" [--strategies react,plan-and-execute,reflect:react,reflect:plan-and-execute] [--max-iterations <positive integer>]
```

## Strategy selectors

| Selector | Behavior |
|----------|----------|
| `react` | Existing unreflected ReAct strategy |
| `plan-and-execute` | Existing unreflected Plan-and-Execute strategy |
| `reflect:react` | ReAct wrapped with Reflection |
| `reflect:plan-and-execute` | Plan-and-Execute wrapped with Reflection |

Existing input, iteration, ordering, and duplicate-selector validation remains in effect. Reflected and unreflected variants can be selected independently.

## Output

Each successful result includes its selected strategy name, latest answer, ordered trace, `llmCalls`, and end-to-end `latencyMs`. Reflection critique events expose the approval decision and feedback. A candidate returned after the reflection limit is exhausted remains marked rejected in its corresponding trace event.

When a reflected run repeats the strategy after a rejection, the full tool workflow is repeated and may cause repeated operational side effects. Strategy errors and invalid critic output remain failures and are not printed as approved successful results.
