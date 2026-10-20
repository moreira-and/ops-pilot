import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";

async function withClient(
  action: (client: Client) => Promise<void>,
): Promise<void> {
  const client = new Client({ name: "opspilot-test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: "npm",
    args: ["run", "--silent", "mcp"],
    env: { OPSPILOT_DB: ":memory:" },
    stderr: "pipe",
  });

  try {
    await client.connect(transport);
    await action(client);
  } finally {
    await client.close();
  }
}

const textToolResultSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    }),
  ),
});

function textResult(result: unknown): string {
  const parsed = textToolResultSchema.parse(result);
  const content = parsed.content[0];
  assert.ok(content?.type === "text" && typeof content.text === "string");
  return content.text;
}

const alertStatusResultsSchema = z.array(
  z.object({ status: z.enum(["firing", "resolved"]) }),
);
const incidentSummarySchema = z.object({
  id: z.string(),
  status: z.enum(["open", "resolved"]),
  severity: z.enum(["critical", "high", "medium", "low"]),
});

test(
  "stdio server identifies as opspilot and lists exactly its three tools",
  { timeout: 15_000 },
  async () => {
    await withClient(async (client) => {
      assert.equal(client.getServerVersion()?.name, "opspilot");

      const response = await client.listTools();
      assert.deepEqual(
        response.tools.map(({ name }) => name).sort(),
        ["list_alerts", "open_incident", "resolve_incident"],
      );
    });
  },
);

test(
  "list_alerts uses the shared default, filters results, and rejects invalid status",
  { timeout: 15_000 },
  async () => {
    await withClient(async (client) => {
      const defaultResult = await client.callTool({
        name: "list_alerts",
        arguments: {},
      });
      const firingResult = await client.callTool({
        name: "list_alerts",
        arguments: { status: "firing" },
      });
      const resolvedResult = await client.callTool({
        name: "list_alerts",
        arguments: { status: "resolved" },
      });
      const invalidResult = await client.callTool({
        name: "list_alerts",
        arguments: { status: "unknown" },
      });
      assert.notEqual(defaultResult.isError, true);
      assert.deepEqual(
        alertStatusResultsSchema.parse(JSON.parse(textResult(defaultResult))),
        alertStatusResultsSchema.parse(JSON.parse(textResult(firingResult))),
      );
      assert.ok(
        alertStatusResultsSchema.parse(JSON.parse(textResult(firingResult)))
          .every(({ status }) => status === "firing"),
      );
      assert.ok(
        alertStatusResultsSchema.parse(JSON.parse(textResult(resolvedResult)))
          .every(({ status }) => status === "resolved"),
      );
      assert.equal(invalidResult.isError, true);
    });
  },
);

test(
  "incident tools open, resolve, and report failures over the shared store",
  { timeout: 15_000 },
  async () => {
    await withClient(async (client) => {
      const openResult = await client.callTool({
        name: "open_incident",
        arguments: {
          title: "Checkout failures",
          service: "checkout",
          severity: "sev2",
        },
      });

      assert.notEqual(openResult.isError, true);
      const opened = incidentSummarySchema.parse(
        JSON.parse(textResult(openResult)),
      );
      assert.equal(opened.status, "open");
      assert.equal(opened.severity, "high");

      const resolveResult = await client.callTool({
        name: "resolve_incident",
        arguments: { id: opened.id },
      });
      assert.notEqual(resolveResult.isError, true);
      const resolved = incidentSummarySchema.parse(
        JSON.parse(textResult(resolveResult)),
      );
      assert.equal(resolved.id, opened.id);
      assert.equal(resolved.status, "resolved");

      const invalidOpenResult = await client.callTool({
        name: "open_incident",
        arguments: {
          title: " ",
          service: "checkout",
          severity: "urgent",
        },
      });
      const unknownIncidentResult = await client.callTool({
        name: "resolve_incident",
        arguments: { id: "missing-incident" },
      });
      assert.equal(invalidOpenResult.isError, true);
      assert.equal(unknownIncidentResult.isError, true);
    });
  },
);
