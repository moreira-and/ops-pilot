# Feature Specification: Provider Status Check

**Feature Branch**: `005-provider-status-check`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: Add a `check_provider_status` capability so the on-call assistant can check GitHub or Cloudflare public status pages when investigating whether an incident is caused by an external provider. GitHub is the default provider. The result should be a compact, single-line indicator and description. Requests should time out after five seconds, and network failures or server errors should be retried once. Invalid responses and any final failure should be returned as readable tool-result text, not raised outside the tool. Cover successful results, timeouts, and invalid responses in network-free tests using an injectable fetch function.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Check an external provider (Priority: P1)

During an incident, an on-call operator suspects that a dependency may be unavailable and asks OpsPilot to check GitHub or Cloudflare. OpsPilot reports the provider's current status in a short, readable result so the operator can compare it with the symptoms in their own service.

**Why this priority**: Quickly distinguishing an external outage from a local problem is the feature's primary incident-response value.

**Independent Test**: Provide a successful status-page response for either supported provider and verify the tool returns its status indicator and description on one line.

**Acceptance Scenarios**:

1. **Given** GitHub is selected or no provider is specified, **When** the operator checks provider status and the status page responds successfully, **Then** the result contains GitHub's status indicator and description on one line.
2. **Given** Cloudflare is selected, **When** the operator checks provider status and the status page responds successfully, **Then** the result contains Cloudflare's status indicator and description on one line.
3. **Given** the operator is investigating whether an incident is external, **When** they use the status check, **Then** its purpose makes clear that it is for checking a suspected provider outage or dependency issue.

### User Story 2 - Receive a useful result when a status check fails (Priority: P2)

When a provider status page is slow, unavailable, or returns unusable information, the on-call operator still receives a clear result from the status check and can continue the incident investigation without the tool failing unexpectedly.

**Why this priority**: The status check must remain a useful observation during the same outages that prompt operators to use it.

**Independent Test**: Simulate a timeout, a network failure, a server error, and an invalid response; verify the retry limit and that final failures are returned as readable results.

**Acceptance Scenarios**:

1. **Given** a status request times out, **When** the tool makes its allowed retry and still cannot obtain a result, **Then** it returns a readable error result and does not raise an exception outside the tool.
2. **Given** a status request fails due to a network error or server error, **When** the tool retries once, **Then** it returns a status result if the retry succeeds.
3. **Given** the provider response does not include a valid status indicator and description, **When** the tool processes the response, **Then** it returns a readable error result and does not raise an exception outside the tool.

### Edge Cases

- The provider returns a server error on both attempts; the final result is a readable error, with no further retry.
- The provider returns an invalid or incomplete status payload; it is treated as a final failure rather than reported as a valid status.
- The provider is not one of the two supported choices; it is rejected as invalid input instead of being sent to an arbitrary destination.
- A valid provider description contains whitespace or line breaks; the result remains compact and on one line.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The assistant MUST provide a provider status check for GitHub and Cloudflare using their public status pages without requiring credentials.
- **FR-002**: The provider selection MUST offer GitHub and Cloudflare as its only choices and MUST default to GitHub when omitted.
- **FR-003**: The status check MUST be described for use when an operator suspects an external provider or dependency outage and needs to distinguish it from a local problem.
- **FR-004**: Each status request MUST have a five-second timeout.
- **FR-005**: The status check MUST make exactly one additional attempt after a network failure or server error, and MUST NOT retry more than once.
- **FR-006**: The status check MUST accept a response only when it contains a status indicator and description in the expected status object.
- **FR-007**: A successful result MUST present the indicator and description together on one compact line.
- **FR-008**: Any final failure, including timeout or invalid response, MUST be returned as readable tool-result text and MUST NOT escape the tool as an exception.
- **FR-009**: The status check MUST be testable without live network access, including successful responses, timeouts, and invalid responses.

### Key Entities

- **Provider**: One supported external dependency, GitHub or Cloudflare, selected for a status check.
- **Status observation**: The provider's current status indicator and human-readable description, or a readable failure result when no valid observation is available.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In successful checks for either supported provider, 100% of results present both the status indicator and description in a single line.
- **SC-002**: Each request attempt completes or times out within five seconds, and no failure path performs more than two attempts in total.
- **SC-003**: In all tested final failure cases, the operator receives a readable tool result rather than an uncaught error.
- **SC-004**: Operators can use the returned status observation to identify whether the selected provider's public status page reports a problem, without needing to interpret a verbose payload.

## Assumptions

- The public status pages are the source of truth for this check; the result is an observation and does not establish the health of OpsPilot's own services.
- The status check supports only GitHub and Cloudflare in this version.
- A timeout is treated as a network failure and receives the single allowed retry. Invalid responses are not retried.
- The check does not persist provider responses or status history.
