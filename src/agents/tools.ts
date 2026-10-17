import { tool } from "@langchain/core/tools";
import { AlertService } from "../services/alert-service.js";
import { IncidentService } from "../services/incident-service.js";
import type { OperationalStore } from "../services/operational-store.js";
import { InMemoryOperationalStore } from "../services/in-memory-operational-store.js";
import { DEMO_DATA } from "../scripts/demo-data.js";
import { z } from "zod";
import {
  alertRecordSchema,
  incidentRecordSchema,
} from "../services/operational-store.js";

const alertStatus = z.enum(["firing", "resolved", "all"]).default("firing");
const severity = z.union([
  z.enum(["critical", "high", "medium", "low"]),
  z.enum(["sev1", "sev2", "sev3", "sev4"]),
]);

export const listAlertsInputSchema = z.object({ status: alertStatus });
export const openIncidentInputSchema = z.object({
  title: z.string().trim().min(1),
  service: z.string().trim().min(1),
  severity,
});
export const resolveIncidentInputSchema = z.object({
  id: z.string().trim().min(1),
});

function normalizeSeverity(
  value: z.infer<typeof severity>,
): "critical" | "high" | "medium" | "low" {
  switch (value) {
    case "sev1":
      return "critical";
    case "sev2":
      return "high";
    case "sev3":
      return "medium";
    case "sev4":
      return "low";
    default:
      return value;
  }
}

export function createOperationalTools(store: OperationalStore) {
  const alerts = new AlertService(store);
  const incidents = new IncidentService(store);

  const listAlerts = tool(
    async ({ status }) =>
      JSON.stringify(
        z.array(alertRecordSchema).parse(await alerts.listAlerts({ status })),
      ),
    {
      name: "list_alerts",
      description:
        "Lista alertas de monitoramento por status. Use para investigar o que está disparando, estados dos serviços ou como está o plantão. status: firing | resolved | all.",
      schema: listAlertsInputSchema,
    },
  );

  const openIncident = tool(
    async ({ title, service, severity: incidentSeverity }) =>
      JSON.stringify(
        incidentRecordSchema.parse(
          await incidents.openIncident({
            title,
            serviceId: service,
            severity: normalizeSeverity(incidentSeverity),
          }),
        ),
      ),
    {
      name: "open_incident",
      description:
        "Abre um incidente para um serviço conhecido. severity aceita critical, high, medium, low ou sev1, sev2, sev3, sev4; os aliases correspondem nessa ordem.",
      schema: openIncidentInputSchema,
    },
  );

  const resolveIncident = tool(
    async ({ id }) =>
      JSON.stringify(
        incidentRecordSchema.parse(await incidents.resolveIncident({ id })),
      ),
    {
      name: "resolve_incident",
      description: "Resolve um incidente existente pelo identificador.",
      schema: resolveIncidentInputSchema,
    },
  );

  return { listAlerts, openIncident, resolveIncident };
}

const defaultStore: OperationalStore = new InMemoryOperationalStore(DEMO_DATA);

export const opsTools = createOperationalTools(defaultStore);
export const listAlerts = opsTools.listAlerts;
export const openIncident = opsTools.openIncident;
export const resolveIncident = opsTools.resolveIncident;
