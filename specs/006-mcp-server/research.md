# Research: OpsPilot MCP Server

## Decision 1: Use the requested MCP SDK package line

**Decision**: Add `@modelcontextprotocol/sdk` from its v1 package line, using the package's MCP server and stdio transport APIs. Preserve the requested package name instead of changing to the separately published v2 `@modelcontextprotocol/server`.

**Rationale**: The feature request explicitly specifies `@modelcontextprotocol/sdk`. Current npm metadata for the package reports version `1.32.1`, Node.js `>=18`, and package exports for server modules, so the project's Node.js 22 runtime satisfies its engine requirement. The same metadata allows Zod `^3.25 || ^4.0`, compatible with the project's existing Zod `^4.6.7`. The new server should use v1 APIs rather than copying API examples from the v2 package.

**Alternatives considered**:

- Use the v2 `@modelcontextprotocol/server` package: rejected because it changes the package explicitly requested by the user.
- Implement MCP framing directly: rejected because the maintained SDK already provides protocol validation and stdio transport.

## Decision 2: Reuse the operational singleton and the existing tool schemas

**Decision**: Register the exported `listAlertsInputSchema`, `openIncidentInputSchema`, and `resolveIncidentInputSchema` directly with MCP. Each MCP handler delegates to the corresponding tool from `getDefaultOperationalTools()` rather than creating a new `SqliteOpsStore` or reimplementing service operations.

**Rationale**: `getDefaultOperationalTools()` lazily creates one operational tool set backed by a single `SqliteOpsStore`. Delegating to those same tool objects shares that exact store instance and preserves the existing input parsing, output serialization, result validation, severity normalization, and domain errors. Registering the exported Zod schemas directly gives MCP the same source of truth and retains schema descriptions/defaults.

**Alternatives considered**:

- Construct another `SqliteOpsStore` for the MCP server: rejected because it would create a separate store instance and could drift from the existing singleton configuration or state.
- Duplicate the Zod schemas and service logic in the MCP folder: rejected because it violates the single-source-of-truth requirement.
- Add a new service layer just for MCP: rejected because existing tool handlers already compose the relevant services and validated outputs.

## Decision 3: Keep stdio stdout protocol-only

**Decision**: Use the SDK stdio transport without stdout logging. Any startup diagnostics or failures use stderr, and the integration test parses protocol responses rather than relying on console text.

**Rationale**: MCP stdio transports JSON-RPC messages over stdin/stdout. Extra stdout text corrupts framing and prevents clients from parsing responses. The official SDK guidance explicitly reserves stdout for protocol messages and recommends stderr for diagnostics.

**Alternatives considered**:

- Print startup messages to stdout: rejected because it corrupts the protocol stream.
- Use HTTP or another transport: rejected because stdio is an explicit requirement.

## Decision 4: Test server discovery via an isolated subprocess

**Decision**: Launch `npm run mcp` as a child process with `OPSPILOT_DB=:memory:`, connect an SDK MCP client over stdio, request the tool list, assert its exact names, and close the client/process cleanly.

**Rationale**: This checks the actual npm command, executable server startup, stdio framing, and advertised tools end to end without external services or writes to the default database.

**Alternatives considered**:

- Unit-test only a registration helper: rejected because it would not validate the requested startup path or stdio protocol.
- Use the default file-backed database in the subprocess test: rejected because it risks writing to developer data and introduces cross-run state.

## References

- MCP SDK npm metadata (v1 package version, engines, exports): <https://registry.npmjs.org/@modelcontextprotocol%2Fsdk/latest>
- MCP TypeScript SDK tool registration guidance: <https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/tools.md>
- MCP TypeScript SDK stdio and stdout/stderr guidance: <https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/stdio.md>
- Existing operational tool schemas and shared singleton: `src/agents/tools.ts`
- Existing SQLite store configuration: `src/store/sqlite-ops-store.ts`
