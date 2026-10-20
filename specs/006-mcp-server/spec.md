# Feature Specification: OpsPilot MCP Server

**Feature Branch**: `006-mcp-server`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: Create an OpsPilot MCP server at `src/mcp/server.ts` using `@modelcontextprotocol/sdk` and stdio transport. Expose `list_alerts`, `open_incident`, and `resolve_incident`; reuse the same OpsStore and the existing tools' Zod schemas as a single source of truth. Name the server `opspilot`. Add the npm script `mcp` with `tsx src/mcp/server.ts`, loading environment configuration first only if required. Do not use `console.log` in the server because stdout carries the protocol; send diagnostics to stderr. Test by starting the server and validating the listed tools.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover OpsPilot tools through MCP (Priority: P1)

An MCP client connects to OpsPilot and discovers the operational capabilities available to assist with an alert or incident. The client can identify the server as `opspilot` and sees the three supported tools.

**Why this priority**: Tool discovery is required before any MCP client can use the operational capabilities.

**Independent Test**: Start the server as an MCP stdio process, connect with an MCP client, and verify the server identity and exact tool names returned by the tool-list operation.

**Acceptance Scenarios**:

1. **Given** the server process is started using the documented npm command, **When** an MCP client completes initialization and requests the tool list, **Then** it receives `list_alerts`, `open_incident`, and `resolve_incident`.
2. **Given** the MCP client is connected, **When** it requests the server identity, **Then** the server identifies itself as `opspilot`.
3. **Given** the client communicates over stdio, **When** the server emits diagnostics, **Then** stdout remains reserved for valid MCP protocol messages and diagnostics are sent to stderr.

### User Story 2 - Investigate alerts using MCP (Priority: P2)

An on-call operator uses an MCP-compatible client to list alerts and inspect the current operational state without switching to a separate interface.

**Why this priority**: Alert visibility is the primary read-only operation for an operator investigating an incident.

**Independent Test**: Invoke `list_alerts` through MCP with omitted and supported status filters; verify the results and defaults match the existing operational tool.

**Acceptance Scenarios**:

1. **Given** the client invokes `list_alerts` without a status, **When** the request is handled, **Then** it uses the existing default status and returns the corresponding alerts.
2. **Given** the client invokes `list_alerts` with a supported status, **When** the request is handled, **Then** it returns alerts filtered by that status.
3. **Given** the client supplies an invalid status, **When** the request is handled, **Then** the request is rejected according to the existing input schema rather than silently accepted.

### User Story 3 - Open and resolve incidents using MCP (Priority: P3)

An on-call operator creates an incident for a confirmed problem and resolves an existing incident through the same MCP connection, with changes reflected in OpsPilot's operational data.

**Why this priority**: Incident lifecycle actions let an operator coordinate work from an MCP client while preserving existing operational behavior.

**Independent Test**: Invoke `open_incident` with valid input, then `resolve_incident` with the returned identifier; verify the created and updated records match the existing operational tools.

**Acceptance Scenarios**:

1. **Given** a confirmed issue and valid incident details, **When** the client invokes `open_incident`, **Then** the server returns the created incident and applies the existing severity and service validation rules.
2. **Given** an existing incident identifier, **When** the client invokes `resolve_incident`, **Then** the server returns the updated incident.
3. **Given** an invalid request or unknown incident identifier, **When** the client invokes an incident action, **Then** it receives the existing validation or domain error behavior and no false success is reported.
4. **Given** an incident has been changed through MCP, **When** the existing operational tools inspect the same store, **Then** they observe the same persisted state.

### Edge Cases

- The server starts but cannot initialize its operational store; startup failure is reported to stderr and the process does not claim successful MCP readiness.
- A client sends invalid arguments or omits a required incident field; the existing Zod input schema rejects the request.
- An incident action references a missing service or incident; the existing domain failure is returned without claiming the action succeeded.
- Diagnostics are produced during initialization or a tool call; none are written to stdout outside the MCP protocol.
- A client requests the tool list repeatedly; each response continues to advertise exactly the supported three tools.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an MCP server identified as `opspilot` and communicate with MCP clients over the stdio transport.
- **FR-002**: The server MUST advertise exactly these three operational tools: `list_alerts`, `open_incident`, and `resolve_incident`.
- **FR-003**: The server MUST use the `@modelcontextprotocol/sdk` package and provide a runnable `npm run mcp` command whose script is `tsx src/mcp/server.ts`. The command MUST load environment configuration first only if the server requires it to run.
- **FR-004**: All three MCP tools MUST operate on the same `SqliteOpsStore` instance and operational data used by the existing OpsPilot tools, so reads and mutations are consistent.
- **FR-005**: The MCP tool input contracts MUST reuse the Zod schemas already defined for the corresponding existing tools; the MCP server MUST NOT define parallel copies of those schemas.
- **FR-006**: The `list_alerts` MCP tool MUST preserve the existing status options, default, filtering behavior, result validation, and error behavior.
- **FR-007**: The `open_incident` MCP tool MUST preserve the existing required fields, accepted severity values and aliases, service validation, result validation, and domain error behavior.
- **FR-008**: The `resolve_incident` MCP tool MUST preserve the existing incident identifier validation, result validation, and domain error behavior.
- **FR-009**: The server MUST NOT call `console.log` or write diagnostic output to stdout. Stdout MUST contain only MCP protocol messages; diagnostics MUST be written to stderr.
- **FR-010**: Automated verification MUST start the server using stdio and validate that the MCP tool-list response contains the exact three required tool names.

### Key Entities

- **MCP server**: The `opspilot` endpoint that initializes a client session and advertises the supported operational tools over stdio.
- **Operational tool**: One of the three alert and incident operations, with its existing validated input and output behavior.
- **Operational store**: The shared persisted state read and modified by OpsPilot's existing tools and the MCP tool handlers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operators can discover all 3 supported alert and incident operations when they connect a compatible client.
- **SC-002**: In 100% of compatibility checks, requests accepted or rejected by the new interface match the existing operational tools' input rules.
- **SC-003**: Every incident opened or resolved through the new interface is observable through existing OpsPilot operations with the same resulting state.
- **SC-004**: Every invalid request or domain failure produces a clear failure result, and no failed operation is reported as successful.

## Assumptions

- The existing `SqliteOpsStore` is the OpsStore referenced in the feature request and remains the persistence source for these operations.
- The existing tool input schemas and services remain authoritative for defaults, validation, output shapes, and domain failures.
- The store's existing default database configuration is sufficient when no environment file is loaded; the `mcp` script only needs environment-file loading if runtime configuration requires it.
- MCP resources, prompts, and additional operational tools are outside this feature's scope.
