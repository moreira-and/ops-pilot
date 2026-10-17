# Data Model: Camada Reflection

Reflection adds in-memory execution data only; it introduces no database entities or persistent records.

## Reflection options

- `maxReflections`: non-negative safe integer; defaults to `2`. Counts regenerated strategy runs after the initial run. Zero disables both the critic and regeneration.
- `modelFactory`: optional injected factory for the structured-output critic. The production default uses the shared configured model factory; tests can inject a deterministic model matching the wrapped strategy's model configuration.

## Critique result

- `approved`: required boolean decision for the candidate answer.
- `feedback`: required string containing reviewer feedback; supplied to the next complete strategy run when `approved` is false and the reflection limit is not exhausted.
- Validation: parse structured model output with the result schema. Malformed output is an explicit failure and is never interpreted as approval.

## Reflected strategy result

The result uses the existing strategy result shape:

- `answer`: the most recent candidate answer, including an unapproved candidate when the reflection limit is exhausted.
- `trace`: the ordered concatenation of strategy traces and critique events, with sequence numbers reassigned contiguously.
- `metrics.llmCalls`: sum of actual model invocations reported by all strategy runs and counted for every critic invocation.
- `metrics.latencyMs`: elapsed wall-clock time for the full decorated operation.

## Trace critique event

Reflection critique events contain `type: "critique"`, a contiguous `sequence`, `approved`, and `feedback`. Existing Plan-and-Execute replanner summaries continue to use `type: "critique"` with `content`. No public trace event contains hidden chain-of-thought.

## State transitions

1. Run the wrapped strategy with the original input.
2. If `maxReflections` is zero, return the base result.
3. Evaluate the candidate against observation events collected in the trace; append one critique event.
4. If approved, return the candidate.
5. If rejected and the configured regeneration count is exhausted, return the candidate with its rejection event.
6. Otherwise, rerun the complete strategy with the original request and rejection feedback, add its metrics and trace, and repeat evaluation.
7. If critic or regeneration execution fails, report failure explicitly; do not silently use an earlier candidate as an approved result.
