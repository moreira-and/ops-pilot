# MCP Contract: OpsPilot Tools

## Server

| Property | Contract |
|---|---|
| Name | `opspilot` |
| Transport | stdio |
| npm command | `npm run mcp` |
| Advertised tools | `list_alerts`, `open_incident`, `resolve_incident` |

The server accepts MCP JSON-RPC on stdin and writes protocol responses to stdout. Stdout MUST NOT include logs, banners, or other diagnostics. Diagnostics, when needed, go to stderr.

## Tools

All arguments are validated using the same exported Zod schemas used by the existing operational tools in `src/agents/tools.ts`. The SDK derives the advertised input schema from these schemas; the MCP adapter MUST NOT define an independent schema copy.

### `list_alerts`

- **Input**: `status` is optional; supported values are `firing`, `resolved`, and `all`; default is `firing`.
- **Behavior**: Delegate to the existing `listAlerts` operational tool.
- **Success**: One text content block containing the existing JSON-serialized alert records.
- **Failure**: An explicit failed MCP tool result; do not report a successful list when the operation failed.

### `open_incident`

- **Input**:
  - `title`: required, non-empty string.
  - `service`: required, non-empty identifier of an existing service.
  - `severity`: required; one of `critical`, `high`, `medium`, `low`, `sev1`, `sev2`, `sev3`, or `sev4`. Aliases map to canonical severities using existing behavior.
- **Behavior**: Delegate to the existing `openIncident` operational tool.
- **Success**: One text content block containing the existing JSON-serialized incident record.
- **Failure**: An explicit failed MCP tool result; do not report creation if validation or the domain operation fails.

### `resolve_incident`

- **Input**: `id` is required and non-empty.
- **Behavior**: Delegate to the existing `resolveIncident` operational tool.
- **Success**: One text content block containing the existing JSON-serialized updated incident record.
- **Failure**: An explicit failed MCP tool result; do not report resolution if validation or the domain operation fails.

## Discovery

An initialized client requesting the tool list receives exactly:

```text
list_alerts
open_incident
resolve_incident
```

## Runtime and errors

- The server uses the existing default operational tool singleton and does not open an independent store.
- MCP input-validation errors and existing domain failures are returned as failed tool results; they are not represented as successful tool content.
- No external network service is required for startup, discovery, or tool invocation.
