import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  getDefaultOperationalTools,
  listAlertsInputSchema,
  openIncidentInputSchema,
  resolveIncidentInputSchema,
} from "../agents/tools.js";

const operationalTools = getDefaultOperationalTools();
const server = new McpServer({
  name: "opspilot",
  version: "1.0.0",
});

server.registerTool(
  "list_alerts",
  {
    description: operationalTools.listAlerts.description,
    inputSchema: listAlertsInputSchema,
  },
  async ({ status }) => ({
    content: [{
      type: "text",
      text: await operationalTools.listAlerts.invoke({ status }),
    }],
  }),
);

server.registerTool(
  "open_incident",
  {
    description: operationalTools.openIncident.description,
    inputSchema: openIncidentInputSchema,
  },
  async ({ title, service, severity }) => ({
    content: [{
      type: "text",
      text: await operationalTools.openIncident.invoke({
        title,
        service,
        severity,
      }),
    }],
  }),
);

server.registerTool(
  "resolve_incident",
  {
    description: operationalTools.resolveIncident.description,
    inputSchema: resolveIncidentInputSchema,
  },
  async ({ id }) => ({
    content: [{
      type: "text",
      text: await operationalTools.resolveIncident.invoke({ id }),
    }],
  }),
);

await server.connect(new StdioServerTransport());
