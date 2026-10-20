# Implementation Plan: OpsPilot MCP Server

**Branch**: `006-mcp-server` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-mcp-server/spec.md`

## Summary

Expose the existing `list_alerts`, `open_incident`, and `resolve_incident` operational tools through a stdio MCP server identified as `opspilot`. Use the requested `@modelcontextprotocol/sdk` v1 package with the existing Zod 4 schemas. Delegate MCP handlers to the singleton operational tools rather than constructing another store or reproducing service behavior; this preserves the existing `SqliteOpsStore` instance, validation, and result behavior. Keep stdout exclusively for protocol traffic and add a subprocess integration test that connects to the running npm command and verifies tool discovery.

## Technical Context

**Language/Version**: TypeScript ESM, Node.js 22 LTS, strict type checking

**Primary Dependencies**: `@modelcontextprotocol/sdk` v1, Zod 4 (already installed), `tsx`; existing LangChain operational tools

**Storage**: Existing embedded SQLite database via the singleton `SqliteOpsStore`; no new store or schema

**Testing**: `node:test` via `tsx`; MCP client and stdio subprocess integration test in `src/mcp/server.test.ts`

**Target Platform**: Node.js 22 server process launched by an MCP host over stdin/stdout

**Project Type**: Agent-backed operational service with a local MCP protocol adapter

**Performance Goals**: No additional performance target; tool discovery must complete within the integration test's bounded timeout

**Constraints**: Server identity `opspilot`; advertise only the 3 specified tools; stdio transport; `npm run mcp` invokes `tsx src/mcp/server.ts`; reuse each existing tool's input Zod schema and the shared operational tool/store singleton; no diagnostic output on stdout; do not read or require `.env` for default startup

**Scale/Scope**: One stdio server entry point, its focused startup/discovery test, and one runtime dependency; no HTTP routes, new domain services, or database changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Explicit MVC Layers and Pure Domain Logic**: Pass. The MCP server is a transport boundary that delegates to existing operational tools/services; it adds no domain or persistence logic.
- **II. Validate at Boundaries with Zod**: Pass. Register the existing Zod input schemas with MCP and let the protocol boundary validate before invoking existing tool handlers. Do not define parallel schemas.
- **III. Represent Domain Errors Explicitly**: Pass. Existing services continue to raise domain errors; the MCP boundary returns failed tool results rather than disguising failures as successful outputs.
- **IV. Tests and Quality Gates**: Pass. Add a deterministic stdio integration test using an isolated in-memory database and assert the exact advertised tools; run `npm run typecheck` and `npm test`.
- **V. Security by Default**: Pass. The server exposes only three fixed named operations, uses no credentials or caller-selected URLs, and does not inspect `.env`. Diagnostics are limited to stderr.
- **VI. Embedded SQLite Persistence**: Pass. Reuse the existing `SqliteOpsStore`; no external database service or new SQL is introduced.

No constitution violations or unresolved clarifications.

## Phase 0: Research Decisions

See [research.md](./research.md). Key decisions:

- Use the specifically requested `@modelcontextprotocol/sdk` v1 package and its stdio server/client APIs; the project targets Node 22 and already uses Zod 4.
- Register the existing exported input schemas and delegate each MCP handler to its matching singleton operational tool.
- Keep all diagnostics off stdout and verify the live subprocess tool list through an MCP client.

## Phase 1: Design

See [data-model.md](./data-model.md) for the logical entities and validation boundaries, [contracts/mcp-tools.md](./contracts/mcp-tools.md) for the MCP-visible tools, and [quickstart.md](./quickstart.md) for runnable verification.

### Project Structure

#### Documentation (this feature)

```text
specs/006-mcp-server/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── mcp-tools.md
└── tasks.md
```

#### Source Code (repository root)

```text
src/
├── agents/
│   └── tools.ts          # Existing tool definitions, input schemas, and singleton
└── mcp/
    ├── server.ts         # MCP stdio adapter for the existing operational tools
    └── server.test.ts    # Stdio subprocess startup and tool-list contract test

package.json              # Add the mcp script and SDK dependency
package-lock.json         # Lock the SDK dependency
```

**Structure Decision**: Keep the MCP adapter and its integration test together in `src/mcp/`, consistent with the repository's `src/http/` boundary layout. The adapter imports schema constants and the existing operational singleton from `src/agents/tools.ts`; it does not add another persistence path or duplicate application rules.

## Constitution Check (Post-Design)

- **MVC and pure domain logic**: Pass. The MCP implementation remains an adapter; operational behavior stays with existing services.
- **Boundary validation**: Pass. The same Zod schemas serve the existing agent tools and MCP input contracts.
- **Domain errors**: Pass. MCP tool failures remain explicit error results; successful output is returned only after the existing tool handler completes.
- **Testing and quality gates**: Pass. The subprocess test proves startup and tool listing; the full existing gates remain required at implementation time.
- **Security**: Pass. No secrets, `.env` inspection, or arbitrary operations are introduced; stdout is reserved for protocol traffic.
- **Persistence**: Pass. Existing singleton database configuration and prepared-statement SQLite implementation remain unchanged.

No constitution violations; no complexity exception is required.

## Complexity Tracking

No constitution violations.
