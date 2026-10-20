# Data Model: OpsPilot MCP Server

This feature introduces no persisted entities or database changes. It exposes existing operational records through a new protocol boundary.

## Logical Entities

### MCP Server

- **Identity**: Name `opspilot`; version supplied by the application package.
- **Transport**: stdio, with JSON-RPC protocol messages on stdout.
- **Capabilities in scope**: tool listing and invocation for three operational tools only.
- **Lifecycle**: initialized on process startup, remains available while the MCP client keeps stdin open, and closes with the stdio connection.

### MCP Tool

A named operation advertised to a client. Every tool has a description, an input contract sourced from an existing Zod schema, and a handler delegated to the existing operational tool instance.

| Tool | Input schema source | Key validation | Result |
|---|---|---|---|
| `list_alerts` | `listAlertsInputSchema` | Optional status defaults to `firing`; allowed values are `firing`, `resolved`, `all` | Text content containing the existing JSON-serialized alert records |
| `open_incident` | `openIncidentInputSchema` | Non-empty title and service; severity is required and accepts canonical values or `sev1`–`sev4` aliases | Text content containing the created incident record |
| `resolve_incident` | `resolveIncidentInputSchema` | Non-empty incident identifier | Text content containing the updated incident record |

Invalid inputs are rejected by the shared schema before domain operations. Domain errors from the existing tool/service flow are represented as failed MCP tool results and must not be converted into success-shaped output.

### Operational Store

- **Identity**: The singleton `SqliteOpsStore` held by the existing default operational tools.
- **Relationship**: All three MCP tool handlers invoke the corresponding existing tool object, which uses this shared store.
- **Persistence**: Existing SQLite database path and initialization behavior; no MCP-specific schema, connection, or persistence layer.
- **State changes**: `open_incident` creates an open incident; `resolve_incident` changes an existing open incident to resolved according to existing store rules. `list_alerts` does not mutate state.

## Invariants

1. The MCP adapter registers the same three exported Zod schemas used by the existing tools; there is no MCP-local schema copy.
2. All operations delegate to the default operational tool singleton and therefore share the same store instance.
3. Exactly the three specified tools are advertised.
4. Stdout contains MCP protocol data only; any diagnostics go to stderr.
