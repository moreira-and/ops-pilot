# Research: Provider Status Check

## Provider endpoints

- **Decision**: Map the closed provider choices `github` and `cloudflare` to their respective public Statuspage status endpoints: `https://www.githubstatus.com/api/v2/status.json` and `https://www.cloudflarestatus.com/api/v2/status.json`.
- **Rationale**: Both endpoints are public, require no credentials, and return the provider's overall status. Fixed mappings prevent arbitrary URL access.
- **Alternatives considered**: Accepting a URL as input was rejected because the feature only needs two known providers and arbitrary targets would expand scope and risk.

## Status response validation

- **Decision**: Accept only a response containing `status.indicator` and `status.description` as strings; treat absent or malformed fields as an invalid status observation.
- **Rationale**: This is the precise response shape required by the feature and keeps the agent's context free of unused payload fields.
- **Alternatives considered**: Returning the complete status page payload was rejected because it is verbose and exposes irrelevant details to the agent.

## Request timeout and retry

- **Decision**: Bound each request attempt to five seconds; make one retry after a timeout, network failure, or HTTP 5xx. Do not retry invalid payloads or other non-server HTTP failures.
- **Rationale**: A single bounded retry offers resilience during transient provider problems without unbounded delays or attempts. The five-second timeout applies per attempt as stated in the specification.
- **Alternatives considered**: No retry was rejected because transient connectivity problems are expected; multiple retries or backoff were rejected because the requirement permits only one additional attempt.

## Tool integration and error results

- **Decision**: Follow the existing `@langchain/core/tools` pattern in `src/agents/tools.ts`. Keep the fetch implementation injectable and return readable failure text from the tool for final errors.
- **Rationale**: This matches current tool construction and enables deterministic, network-free unit tests while ensuring external failures remain observations rather than escaping exceptions.
- **Alternatives considered**: A separately persisted status service was rejected because status observations are read-only, transient, and not stored by this feature.

## Validation

- **Decision**: Use the existing Zod 4 dependency for the provider input and the external response shape; add tests to the existing `src/agents/tools.test.ts` suite.
- **Rationale**: Reuses project dependencies, test runner, and established agent-tool testing conventions.
- **Alternatives considered**: Adding another schema or test dependency was rejected as unnecessary.
