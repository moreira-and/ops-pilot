# Tasks: OpsPilot MCP Server

**Input**: Design documents from `/specs/006-mcp-server/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Integration and boundary tests are required by the feature specification.

**Organization**: Tasks are grouped by user story to enable incremental implementation and independent verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel without touching the same files or depending on incomplete work.
- **[Story]**: User story from `spec.md`.
- All task descriptions identify the files to change or verify.

## Phase 1: Setup

**Purpose**: Add the MCP SDK dependency and requested runnable command.

- [x] T001 Add `@modelcontextprotocol/sdk` v1 dependency and the exact `"mcp": "tsx src/mcp/server.ts"` script in `package.json`, then update `package-lock.json` using npm.

---

## Phase 2: Foundational

**Purpose**: No additional foundational code is required; operational tools, Zod schemas, and the SQLite singleton already exist.

---

## Phase 3: User Story 1 - Discover OpsPilot tools through MCP (Priority: P1) 🎯 MVP

**Goal**: Start the named OpsPilot server over stdio and let a client discover exactly the three required tool names.

**Independent Test**: Launch `npm run mcp` as a subprocess, initialize an MCP client, and verify server name `opspilot`, exact tool names, valid protocol responses, and no unexpected stdout text.

### Tests for User Story 1

- [x] T002 [US1] Add a stdio subprocess integration test in `src/mcp/server.test.ts` that launches `npm run mcp` with `OPSPILOT_DB=:memory:`, checks server identity and the exact three-tool list, and fails if stdout is not valid MCP protocol.

### Implementation for User Story 1

- [x] T003 [US1] Create `src/mcp/server.ts` using `McpServer` and `StdioServerTransport`, name it `opspilot`, and register `list_alerts`, `open_incident`, and `resolve_incident` with the existing exported Zod schemas; keep diagnostics on stderr only and make discovery work before adding the story-specific handlers.

**Checkpoint**: The MCP client initializes and discovers exactly the three operations without stdout contamination.

---

## Phase 4: User Story 2 - Investigate alerts using MCP (Priority: P2)

**Goal**: Let a client list alerts with the existing default, filtering, schema validation, and result behavior.

**Independent Test**: Invoke `list_alerts` with omitted status and with supported statuses; compare returned records to the existing operational tool, and confirm invalid status is rejected.

### Tests for User Story 2

- [x] T004 [US2] Extend `src/mcp/server.test.ts` to call `list_alerts` with omitted, supported, and invalid status arguments and assert the default, filtered results, and validation failure.

### Implementation for User Story 2

- [x] T005 [US2] Implement the `list_alerts` MCP handler in `src/mcp/server.ts` by delegating to the existing `listAlerts` tool object and returning its validated serialized result or an explicit failed tool result.

**Checkpoint**: Alert reads over MCP behave identically to the existing operational tool.

---

## Phase 5: User Story 3 - Open and resolve incidents using MCP (Priority: P3)

**Goal**: Let a client create and resolve incidents with existing input rules and shared operational state.

**Independent Test**: Open an incident through MCP with a valid existing service, resolve it using its returned identifier, and verify both results and error behavior against the existing operational tools.

### Tests for User Story 3

- [x] T006 [US3] Extend `src/mcp/server.test.ts` to open and resolve an incident through MCP, verify returned state and shared-store visibility, and assert invalid inputs and unknown identifiers do not produce success results.

### Implementation for User Story 3

- [x] T007 [US3] Implement the `open_incident` and `resolve_incident` MCP handlers in `src/mcp/server.ts` by delegating to the matching existing tool objects, preserving shared schemas, severity aliases, output validation, and explicit MCP error results.

**Checkpoint**: Incident mutations through MCP are visible through the same operational data and failures remain explicit.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the complete feature against the implementation plan and repository quality gates.

- [x] T008 Run the focused MCP integration test, `npm run typecheck`, and `npm test`; resolve feature-related failures and confirm the validation commands in `specs/006-mcp-server/quickstart.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; must complete before server/test work.
- **Foundational (Phase 2)**: No tasks; existing tool schemas and singleton are reused.
- **User Story 1 (Phase 3)**: Depends on T001; provides the stdio server and discovery MVP.
- **User Story 2 (Phase 4)**: Depends on T003; adds and verifies alert invocation.
- **User Story 3 (Phase 5)**: Depends on T005; adds and verifies incident lifecycle operations.
- **Polish (Phase 6)**: Depends on all desired story tasks.

### User Story Dependencies

- **US1 (P1)**: Depends on setup only; independently testable as tool discovery.
- **US2 (P2)**: Depends on the server from US1; independently verifies alert listing.
- **US3 (P3)**: Depends on the server and tool wiring from US1/US2; independently verifies incident lifecycle behavior.

### Parallel Opportunities

- No implementation tasks are marked parallel: the server test file and server entry point are touched across sequential user-story tasks, and later stories depend on server setup.
- After task T001, the integration harness and server skeleton may be implemented concurrently only if kept in separate files; task ordering remains sequential here to preserve the test-first story checkpoints.

## Parallel Example: User Story 1

```text
No parallel tasks are scheduled. T002 establishes the subprocess/client contract before T003 implements the server.
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 to install the SDK and add the npm command.
2. Add and run T002 to establish the discovery test.
3. Implement T003 and verify that the running server identifies as `opspilot` and lists exactly three tools.
4. Stop and validate the stdio discovery MVP.

### Incremental Delivery

1. Complete US1 for a working MCP connection and discoverable tool list.
2. Complete US2 so alert reads preserve existing behavior.
3. Complete US3 so incident lifecycle actions share existing state.
4. Run the focused and full quality gates in T008.
