import { tool } from "@langchain/core/tools";
import type { ToolRuntime } from "@langchain/core/tools";
import { AlertService } from "../services/alert-service.js";
import { IncidentService } from "../services/incident-service.js";
import type { OperationalStore } from "../services/operational-store.js";
import {
  createPreferenceForgetService,
  type PreferenceMemoryStore,
} from "../services/preference-forget-service.js";
import { RunbookService, runbookLookupResultSchema } from "../services/runbook-service.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { DEMO_DATA } from "../scripts/demo-data.js";
import { DEMO_RUNBOOKS } from "../scripts/demo-runbooks.js";
import { z } from "zod";
import {
  alertRecordSchema,
  incidentRecordSchema,
} from "../services/operational-store.js";

export const forgetPreferenceInputSchema = z.object({
  preference: z.string().trim().min(1).max(500).describe(
    "Descrição da preferência que deve ser esquecida; não inclua userId ou identificadores internos.",
  ),
}).strict();
const forgetPreferenceContextSchema = z.object({
  userId: z.string().trim().min(1),
}).strict();
const forgetPreferenceOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("deleted"), preference: z.string().min(1) }),
  z.object({ status: z.literal("not_found") }),
  z.object({
    status: z.literal("ambiguous"),
    candidates: z.array(z.string().min(1)).min(2).max(3),
  }),
]);

export function createForgetPreferenceTool(memoryStore: PreferenceMemoryStore) {
  return tool(
    async (
      input,
      runtime: ToolRuntime<unknown, z.infer<typeof forgetPreferenceContextSchema>>,
    ) => {
      return runForgetPreferenceTool(memoryStore, input, runtime.context);
    },
    {
      name: "forget_preference",
      description:
        "Remove uma preferência durável que a pessoa pediu explicitamente para esquecer. " +
        "Use somente para pedidos de esquecimento; preference descreve o fato a remover. " +
        "Se o resultado for ambiguous, pergunte qual opção deve ser removida. " +
        "Se for not_found, informe que nenhuma preferência correspondente foi encontrada. " +
        "Só confirme remoção quando status for deleted; não invente resultados.",
      schema: forgetPreferenceInputSchema,
    },
  );
}

export async function runForgetPreferenceTool(
  memoryStore: PreferenceMemoryStore,
  inputValue: unknown,
  contextValue: unknown,
): Promise<string> {
  const { preference } = forgetPreferenceInputSchema.parse(inputValue);
  const { userId } = forgetPreferenceContextSchema.parse(contextValue);
  const service = createPreferenceForgetService(memoryStore);
  const outcome = forgetPreferenceOutcomeSchema.parse(
    await service.forget(userId, preference),
  );
  return JSON.stringify(outcome);
}

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
export const checkProviderStatusInputSchema = z.object({
  provider: z.enum(["github", "cloudflare"])
    .default("github")
    .describe("Provedor para consultar quando houver suspeita de problema externo ou dependência fora do ar; padrão github."),
});

const providerStatusResponseSchema = z.object({
  status: z.object({
    indicator: z.string(),
    description: z.string(),
  }),
});

const STATUS_URL = {
  github: "https://www.githubstatus.com/api/v2/status.json",
  cloudflare: "https://www.cloudflarestatus.com/api/v2/status.json",
} as const;

async function fetchProviderStatus(
  provider: keyof typeof STATUS_URL,
  doFetch = fetch,
): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let response: Response;
    try {
      response = await doFetch(STATUS_URL[provider], {
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      if (attempt < 2) continue;
      const message = (error instanceof Error ? error.message : String(error))
        .replace(/\s+/g, " ")
        .trim();
      return `Não consegui consultar o status de ${provider} após 2 tentativas (${message}). Responda com base nos alertas internos e avise o plantonista.`;
    }

    if (response.status >= 500) {
      if (attempt < 2) continue;
      return `Status page de ${provider} respondeu HTTP ${response.status} após 2 tentativas. Responda com base nos alertas internos e avise o plantonista.`;
    }

    if (!response.ok) {
      return `Status page de ${provider} respondeu HTTP ${response.status}. Responda com base nos alertas internos e avise o plantonista.`;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return `Status page de ${provider} retornou uma resposta inválida. Responda com base nos alertas internos e avise o plantonista.`;
    }

    const parsed = providerStatusResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return `Status page de ${provider} retornou uma resposta inválida. Responda com base nos alertas internos e avise o plantonista.`;
    }

    const indicator = parsed.data.status.indicator.replace(/\s+/g, " ").trim();
    const description = parsed.data.status.description.replace(/\s+/g, " ").trim();
    return `${provider} está ${indicator} - ${description}`;
  }

  return `Não consegui consultar o status de ${provider} após 2 tentativas. Responda com base nos alertas internos e avise o plantonista.`;
}

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

export function createOperationalTools(
  store: OperationalStore,
  fetchImpl: typeof fetch = fetch,
) {
  const alerts = new AlertService(store);
  const incidents = new IncidentService(store);
  const runbooks = new RunbookService(store);

  const checkProviderStatus = tool(
    async ({ provider }) => fetchProviderStatus(provider, fetchImpl),
    {
      name: "check_provider_status",
      description:
        "Consulta o status público do GitHub ou Cloudflare. Use quando houver suspeita de problema externo ou dependência fora do ar para distinguir se o problema é do serviço local ou do provedor. Se a consulta falhar, responda com base nos alertas internos e avise o plantonista; não invente nem afirme um status que não foi retornado.",
      schema: checkProviderStatusInputSchema,
    },
  );

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

  return {
    listAlerts,
    openIncident,
    resolveIncident,
    listIncidents,
    consultarRunbook,
    check_provider_status: checkProviderStatus,
  };
}

let defaultTools: ReturnType<typeof createOperationalTools> | undefined;

export function getDefaultOperationalTools(): ReturnType<typeof createOperationalTools> {
  defaultTools ??= createOperationalTools(
    new SqliteOpsStore(undefined, { data: DEMO_DATA, runbooks: DEMO_RUNBOOKS }),
  );
  return defaultTools;
}
