# Research: API HTTP do Chat

## Decisions

### Express application construction

- **Decision**: Export an Express application factory from `src/http/server.ts`. Let it accept a strategy registry and a timeout duration with production defaults, so tests can inject fake strategies and a short timeout.
- **Rationale**: Express 5 is already a production dependency, and an app factory allows HTTP-level tests to exercise parsing and route behavior without importing model initialization or making external calls.
- **Alternatives considered**: Start a fixed listener as a module side effect; rejected because it prevents isolated test setup and makes importing the route bind a port. Add a new HTTP test dependency; rejected because Node's built-in HTTP client and `node:test` suffice.

### Development server startup

- **Decision**: Wire the existing `src/index.ts` entrypoint, used by `npm run dev`, to start the Express app and listen on `PORT`, defaulting to port 3000.
- **Rationale**: An exported app factory alone would not make the endpoint available through the repository's existing development command. Keeping listener startup in the entrypoint preserves import safety for HTTP tests.
- **Alternatives considered**: Add a new package script and entrypoint; rejected because the repository already has a development entrypoint. Start listening as a side effect when importing `src/http/server.ts`; rejected because it prevents isolated tests and reuse.

### Strategy registry and reflection

- **Decision**: Export a registry from `src/agents/index.ts` mapping base names (`react`, `plan-and-execute`) to the existing strategies. Resolve the requested base strategy first, then wrap it per request with the repository's existing `withReflection` function when `reflact` is `true`. Allow the Express app factory to receive a reflection decorator override so integration tests can assert the option path without a model call.
- **Rationale**: Arena already demonstrates these two base strategies and uses `withReflection` for reflected variants. Per-request decoration avoids mutable global registry state and avoids needing separate reflected entries for the boolean option.
- **Alternatives considered**: Add `reflect:` names as the only reflected selection mechanism; rejected because the HTTP request explicitly carries a reflection boolean. Implement a second reflection wrapper; rejected because the shared helper already provides the behavior. Exercise the production critic in integration tests; rejected because it would require a model request and violate deterministic, network-free testing.
- **Terminology note**: The input calls the helper `withReflaction`; the actual existing exported symbol is `withReflection`, which is the implementation to reuse. The request field remains spelled `reflact` as specified.

### Request and response validation

- **Decision**: Parse the JSON body with a Zod schema before strategy selection and parse the completed result with the existing `reasoningResultSchema` before responding. Trim and require a non-empty `message`; default `strategy` to `react` and `reflact` to `false`.
- **Rationale**: This matches `reasoningInputSchema` and the constitution's boundary-validation rule. Returning Zod issues makes invalid client input actionable.
- **Alternatives considered**: Validate only required property presence; rejected because whitespace-only messages would pass but fail the reasoning input contract. Trust strategy output; rejected because the HTTP response is an external boundary.

### Timeout behavior

- **Decision**: Bound the strategy promise with a 180,000 ms deadline and translate expiry to 504. Keep the production timeout fixed by default but allow the app factory's timeout dependency to be shortened in tests.
- **Rationale**: The strategy interface has no `AbortSignal` or cancellation method. A bounded wait guarantees the HTTP contract while allowing fast deterministic timeout tests. The timeout race must keep rejection handling attached to the pending strategy promise.
- **Alternatives considered**: Make tests wait the full 180 seconds; rejected as an unnecessarily slow suite. Change every strategy to support cancellation; rejected as a broader API change not needed to satisfy the response deadline.
- **Limitation**: A timeout ends the HTTP wait but cannot promise cancellation of work already executing in the selected strategy.

### Integration test transport

- **Decision**: Start the Express app on an ephemeral loopback port in integration tests and send requests with Node's built-in `fetch`; inject fake strategies with deterministic results.
- **Rationale**: This exercises the real HTTP parser, middleware, route, and response behavior while requiring neither an external network nor model/database credentials.
- **Alternatives considered**: Call the Express handler directly with handcrafted request/response objects; rejected because that bypasses HTTP parsing and weakens integration coverage. Use an external HTTP testing library; rejected because it is not a project dependency and is unnecessary.

## Resolved Unknowns

- The project already uses Express 5, Zod 4, strict TypeScript ESM, and `node:test` via `tsx`.
- The reasoning result contract is already defined by `reasoningResultSchema`.
- The reflection helper is `withReflection` in `src/agents/reflection.ts`.
- Strategy implementations are `reactStrategy` and `planAndExecuteStrategy`; both are registered by the HTTP feature.
- No database or OpenRouter dependency is needed in the integration test path.
