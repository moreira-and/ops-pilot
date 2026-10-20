# Quickstart: OpsPilot MCP Server

## Prerequisites

- Node.js 22 LTS
- Project dependencies installed

No `.env` file or external service is required to start the server or list its tools.

## Start the server

From the repository root:

```sh
npm run mcp
```

The process waits for an MCP client on stdio. stdout is reserved for MCP protocol frames; any diagnostics appear on stderr.

## Validate the MCP tool list

Run the focused stdio integration test:

```sh
node --import tsx --test src/mcp/server.test.ts
```

The test starts the actual `npm run mcp` command with `OPSPILOT_DB=:memory:`, connects an MCP client over stdio, and asserts that tool discovery returns exactly:

```text
list_alerts
open_incident
resolve_incident
```

The test must finish without making external network requests or changing the default on-disk database.

## Validate project quality gates

```sh
npm run typecheck
npm test
```

Expected outcome: both commands pass, and the MCP subprocess test exits cleanly after the client closes the stdio connection.

See [the MCP tool contract](./contracts/mcp-tools.md) and [data model](./data-model.md) for the complete input, output, validation, and state-sharing requirements.
