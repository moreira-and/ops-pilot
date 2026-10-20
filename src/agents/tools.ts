import { tool } from "@langchain/core/tools";
import { AlertService } from "../services/alert-service.js";
import { IncidentService } from "../services/incident-service.js";
import type { OperationalStore } from "../services/operational-store.js";
import { RunbookService, runbookLookupResultSchema } from "../services/runbook-service.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { DEMO_DATA } from "../scripts/demo-data.js";
import { DEMO_RUNBOOKS } from "../scripts/demo-runbooks.js";
import { z } from "zod";
import {
  alertRecordSchema,
  incidentRecordSchema,
} from "../services/operational-store.js";

const alertStatus = z.enum(["firing", "resolved", "all"])
  .default("firing")
  .describe("Filtro opcional de estado do alerta; padrão firing.");
const incidentStatus = z.enum(["open", "resolved", "all"])
  .default("open")
  .describe("Filtro opcional de estado do incidente; padrão open.");
const severity = z.union([
  z.enum(["critical", "high", "medium", "low"]),
  z.enum(["sev1", "sev2", "sev3", "sev4"]),
]).describe("Severidade; aliases sev1, sev2, sev3 e sev4 correspondem a critical, high, medium e low.");

export const listAlertsInputSchema = z.object({
  status: alertStatus,
});
export const openIncidentInputSchema = z.object({
  title: z.string().trim().min(1).describe("Título não vazio do problema confirmado."),
  service: z.string().trim().min(1).describe("Identificador conhecido do serviço afetado."),
  severity,
});
export const resolveIncidentInputSchema = z.object({
  id: z.string().trim().min(1).describe("Identificador conhecido do incidente existente."),
});
export const listIncidentsInputSchema = z.object({
  status: incidentStatus,
});
export const consultarRunbookInputSchema = z.object({
  service: z.string().trim().min(1).describe("Identificador do serviço cujo runbook será consultado."),
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
  const runbooks = new RunbookService(store);

  const listAlerts = tool(
    async ({ status }) =>
      JSON.stringify(
        z.array(alertRecordSchema).parse(await alerts.listAlerts({ status })),
      ),
    {
      name: "list_alerts",
      description:
        "Lista alertas e retorna seus registros. Use para investigar sinais de monitoramento ou consultar o estado do plantão; não use para abrir ou resolver incidentes. O campo opcional status filtra firing, resolved ou all e, se omitido, assume firing. Use os estados e identificadores retornados, comunique falhas, não invente resultados e não afirme resultados que não foram retornados.",
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
        "Abre e retorna um incidente para acompanhamento. Use somente para um problema confirmado que precise de acompanhamento formal ou quando o usuário pedir explicitamente a abertura; não use apenas para investigar alertas, resumir sinais ou especular sobre uma falha. title é o título obrigatório e não vazio; service é o identificador obrigatório de um serviço conhecido; severity é obrigatória e aceita critical, high, medium, low ou os aliases sev1, sev2, sev3, sev4 (nessa ordem). Use apenas fatos conhecidos, não invente dados, informe erros e só confirme a abertura após receber o registro criado.",
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
      description:
        "Resolve e retorna um incidente existente. Use quando o operador solicitar a resolução ou confirmar que o trabalho foi concluído; não use para encerrar incidentes sem evidência. id é o identificador obrigatório e não vazio de um incidente conhecido. Não invente dados; se o registro não existir, comunique a falha e confirme a resolução somente após receber o incidente atualizado.",
      schema: resolveIncidentInputSchema,
    },
  );

  const listIncidents = tool(
    async ({ status }) =>
      JSON.stringify(
        z.array(incidentRecordSchema).parse(
          await incidents.listIncidents(status),
        ),
      ),
    {
      name: "list_incidents",
      description:
        "Lista incidentes e retorna os registros correspondentes. Use para acompanhar o trabalho operacional; não use para consultar alertas ou procedimentos. status é opcional e aceita open, resolved ou all; se omitido, assume open. Respeite os estados e IDs retornados, comunique erros ou falhas e não invente nem afirme resultados sem retorno.",
      schema: listIncidentsInputSchema,
    },
  );

  const consultarRunbook = tool(
    async ({ service }) =>
      JSON.stringify(
        runbookLookupResultSchema.parse(await runbooks.getRunbook(service)),
      ),
    {
      name: "consultar_runbook",
      description:
        "Consulta e retorna o runbook associado a um serviço sem executar seus passos. Use antes de orientar uma investigação ou mitigação; não use para executar ações ou para substituir a confirmação do operador. service é o identificador obrigatório e não vazio do serviço. Se o serviço ou runbook não existir, a resposta informa explicitamente a indisponibilidade. Não invente procedimentos nem declare ações concluídas.",
      schema: consultarRunbookInputSchema,
    },
  );

  return { listAlerts, openIncident, resolveIncident, listIncidents, consultarRunbook };
}

let defaultTools: ReturnType<typeof createOperationalTools> | undefined;

export function getDefaultOperationalTools(): ReturnType<typeof createOperationalTools> {
  defaultTools ??= createOperationalTools(
    new SqliteOpsStore(undefined, { data: DEMO_DATA, runbooks: DEMO_RUNBOOKS }),
  );
  return defaultTools;
}
