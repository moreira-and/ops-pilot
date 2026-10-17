# Reasoning Strategy Contract

## Shared TypeScript-facing behavior

Each strategy is selected by a stable `name` and exposes an asynchronous `run(input, options)` operation. The request is non-empty text; `options.maxIterations` is a positive integer.

Successful and bounded runs return:

- `answer`: non-empty user-facing text;
- `trace`: ordered events of type `thought | action | observation | plan | critique | answer`;
- `metrics.llmCalls`: non-negative count of actual model invocations, including failed invocations;
- `metrics.latencyMs`: non-negative elapsed time for the whole run.

An `action` event contains a tool name, tool-call ID when provided, and validated/redacted arguments. Tool outcomes or errors appear as observations. Plan and critique events expose the structured plan/review summary needed to explain progress. Hidden chain-of-thought is not a public trace field.

`llmCalls` counts each actual model invocation, including retry attempts and failed requests, exactly once; tool calls, streamed chunks, and graph nodes do not count as model calls.

## Strategy names

- `react`: prebuilt tool-calling ReAct graph with the alert/incident tools.
- `plan-and-execute`: string-step planner, one-step tool executor, and replanner graph; at most eight completed and pending steps in total across replans. After each step, the replanner can adjust, continue, or finish.

Both strategies use the same model factory and tool definitions. They can receive controlled model/store dependencies in tests.

## Operational tools

### `list_alerts`

- Input: `{ status?: "firing" | "resolved" | "all" }`; omitted status defaults to `firing`.
- Output: list of matching alerts, each with identifier, title, service, status, and severity.
- Errors: invalid status or storage failure is explicit.

### `open_incident`

- Input: `{ title: non-empty string, service: existing service identifier, severity: "critical" | "high" | "medium" | "low" | "sev1" | "sev2" | "sev3" | "sev4" }`; `sev1` through `sev4` normalize respectively to `critical`, `high`, `medium`, and `low`.
- Output: incident in the shared in-memory store with identifier, title, service, severity, and `open` status.
- Errors: invalid input, unknown service, or storage failure is explicit.

### `resolve_incident`

- Input: `{ id: non-empty incident identifier }`
- Output: incident in the shared in-memory store in `resolved` state.
- Errors: invalid input, unknown incident, or storage failure is explicit.

All tool inputs and outputs are validated with Zod. Tool errors must never be returned as a successful action result.
