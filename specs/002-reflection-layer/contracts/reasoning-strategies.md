# Reasoning Strategy Reflection Contract

## Decorator

`withReflection(strategy, opts)` accepts any strategy implementing the existing asynchronous `run(input, options)` contract and returns a strategy with the same callable contract. The reflected strategy validates input and options using the established strategy boundary.

### Options

| Option | Required | Default | Validation |
|--------|----------|---------|------------|
| `maxReflections` | No | `2` | Non-negative safe integer |
| `modelFactory` | No | Shared configured model factory | Creates the model used for structured critique; custom compositions must configure it to the same model identity as the wrapped strategy |

`maxReflections` is the maximum number of complete strategy reruns after the initial run. Zero skips critique entirely.

## Evaluation and regeneration

For each candidate, the critic receives the candidate answer and the observation events gathered from the runs so far. Its validated structured result is:

```text
{ approved: boolean, feedback: string }
```

If approved, return immediately. If rejected and regenerations remain, call the entire wrapped strategy again with the original user request and the critique feedback in its context. Rejected attempts can have executed tools already; a full rerun can repeat those side effects. If the limit is reached, return the latest candidate and retain its rejection event in the trace.

Invalid structured output, critic request failures, and regeneration failures are explicit failures, never approval. A zero limit returns the original result unchanged apart from wrapper-level elapsed-time measurement.

## Result and trace

The result retains the standard `answer`, `trace`, and `metrics` fields. Trace sequence values are contiguous across strategy runs and appended critique events. Each Reflection-generated critique event includes `approved` and `feedback`; the existing Plan-and-Execute `critique` summary event with `content` remains valid. Hidden model reasoning is not exposed.

`metrics.llmCalls` sums strategy run counts and each actual critic model invocation once. `metrics.latencyMs` measures full end-to-end wrapper time.
