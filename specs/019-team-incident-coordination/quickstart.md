# Quickstart: Team Incident Coordination

## Prerequisites

- Node.js 22 and the repository dependencies installed.
- No OpenRouter key or external provider is required for automated tests; model, worker, tool, and trace dependencies are injected.

## Automated validation

From the repository root, run:

```sh
npm run typecheck
npm test
npm run build:web
```

Expected results:

- TypeScript checks pass for both the backend and web client.
- Tests cover supervisor routing, request isolation, the eight-handoff maximum, role tool permissions, approval-gated mutations, trace persistence, and handoff rendering.
- The frontend production build completes with the shared handoff trace schema.

Verified: typecheck and web build passed; `npm test` passed 253 tests with one existing skip (254 total).

## End-to-end scenarios

1. **Explicit team route**: Submit a valid existing chat request with `strategy: "team"`. Confirm the outer router is bypassed, a final response is returned, the request trace route is `team`, and each role dispatch appears as an ordered `handoff` event.
2. **Automatic team route**: Inject a routing decision for `team`; confirm the team graph executes once and the result conforms to the regular chat response schema.
3. **Role isolation**: Exercise each role with fake dependencies. Confirm the analyst can call only read-only tools, the planner cannot call tools, and the executor can call only incident tools.
4. **Approval path**: Have the executor propose an incident mutation. Confirm `/chat` returns the existing HTTP 202 accepted response, no incident write occurs before approval, and the final reported status follows the existing action-decision result.
5. **Dispatch limit**: Return eight role decisions followed by a request for another role. Confirm the graph stops before dispatch nine and returns a clearly incomplete answer.
6. **Persistence upgrade**: Open a database created with the prior route/event constraints. Confirm prior request and trace records remain queryable and the store accepts a `team` request with a `handoff` event.
7. **Trace UI**: Pass a valid response with a handoff event to “Ver raciocínio”. Confirm the destination and brief render in sequence and events from other requests are not shown.
8. **Malformed supervisor output**: Return an unknown `next` or empty `brief`. Confirm the request fails explicitly and no role is invoked as a fallback.
