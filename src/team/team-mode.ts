import { BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { createModel } from "../agents/model.js";
import { ModelCallCounter, startTimer } from "../agents/metrics.js";
import { lastText } from "../agents/react.js";
import {
  reasoningInputSchema,
  reasoningOptionsSchema,
  reasoningResultSchema,
  traceEventSchema,
  type ReasoningStrategy,
  type TraceEvent,
} from "../agents/reasoning.js";
import { createOperationalTools, getDefaultOperationalTools } from "../agents/tools.js";
import type { OperationalStore } from "../services/operational-store.js";
import type { PendingActionService } from "../services/pending-action-service.js";

const roleSchema = z.enum(["analista", "planejador", "executor"]);
const decisionSchema = z.object({
  next: z.enum(["analista", "planejador", "executor", "done"]),
  brief: z.string().trim().min(1).describe("Instrução para o próximo papel ou resumo final se done."),
}).strict();
const roleResultSchema = z.object({
  content: z.string().trim().min(1),
  status: z.enum(["complete", "pending", "blocked", "failed"]),
}).strict();
const boardEntrySchema = roleResultSchema.extend({
  role: z.enum(["analista", "planejador", "executor", "supervisor"]),
  kind: z.enum(["observations", "plan", "operation"]),
});
const teamExecutionSchema = z.object({
  requestId: z.string().uuid().optional(),
  input: reasoningInputSchema,
  board: z.array(boardEntrySchema),
  handoffs: z.number().int().min(0).max(8),
  answer: z.string().trim().min(1),
  trace: z.array(traceEventSchema),
});
type Role = z.infer<typeof roleSchema>;
type BoardEntry = z.infer<typeof boardEntrySchema>;
type RoleResult = z.infer<typeof roleResultSchema>;

const SUPERVISOR_PROMPT =
  "Você é o supervisor de uma equipe de plantão. Escolha analista para observar fatos, " +
  "planejador para propor passos sem ferramentas, executor para operações de incidentes, " +
  "ou done para encerrar. Use o quadro compartilhado, não invente fatos e nunca declare " +
  "operações pendentes, bloqueadas ou falhas como concluídas. Retorne next e brief.";
const prompts: Record<Role, string> = {
  analista: "Você é o ANALISTA do plantão. Sua única função é produzir diagnóstico FACTUAL " +
    "usando ferramentas de leitura. Liste alertas disparando com data e severidade, incidentes " +
    "recentes abertos e resolvidos, runbooks relevantes, status dos provedores e janelas ou " +
    "fatos conhecidos do time. NÃO proponha soluções. NÃO abra nem resolva nada. " +
    "Use tópicos telegráficos e não afirme dados ausentes das observações.",
  planejador: "Você é o PLANEJADOR do plantão. Com base nas observações, proponha próximos " +
    "passos ordenados. Não execute operações, não invente fatos e explicite incertezas.",
  executor: "Você é o EXECUTOR de incidentes. Use apenas ferramentas de incidente. " +
    "Respeite aprovações: ações pendentes não foram executadas. Relate resultados, " +
    "bloqueios e falhas sem afirmar sucesso sem confirmação.",
};
const contextSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  requestId: z.string().uuid().optional(),
});

export interface TeamDependencies {
  pendingActions?: Pick<PendingActionService, "propose">;
  operationalStore?: OperationalStore;
  modelFactory?: () => BaseChatModel;
  supervisor?: (context: { input: string; board: BoardEntry[] }) => Promise<unknown>;
  runRole?: (role: Role, brief: string, board: BoardEntry[]) => Promise<unknown>;
  agentFactory?: (
    role: "analista" | "executor",
    tools: StructuredToolInterface[],
    prompt: string,
  ) => {
    invoke(input: { messages: HumanMessage[] }, config: RunnableConfig & {
      context: { userId?: string; requestId?: string };
    }): Promise<{ messages: unknown }>;
  };
}

export function createTeamStrategy(dependencies: TeamDependencies): ReasoningStrategy {
  const modelFactory = dependencies.modelFactory ?? createModel;
  return {
    name: "team",
    async run(input, options) {
      const request = reasoningInputSchema.parse(input);
      const { userId, requestId } = reasoningOptionsSchema.parse(options ?? {});
      const elapsed = startTimer();
      const counter = new ModelCallCounter();
      const stateSchema = Annotation.Root({
        board: Annotation<BoardEntry[]>({ reducer: (_old, value) => value, default: () => [] }),
        trace: Annotation<TraceEvent[]>({ reducer: (_old, value) => value, default: () => [] }),
        count: Annotation<number>({ reducer: (_old, value) => value, default: () => 0 }),
        next: Annotation<z.infer<typeof decisionSchema>["next"]>({ reducer: (_old, value) => value, default: () => "done" }),
        brief: Annotation<string>({ reducer: (_old, value) => value, default: () => "" }),
        answer: Annotation<string>({ reducer: (_old, value) => value, default: () => "" }),
      });

      const runWorker = async (role: Role, brief: string, board: BoardEntry[]): Promise<RoleResult> => {
        if (dependencies.runRole) {
          return roleResultSchema.parse(await dependencies.runRole(role, brief, board));
        }
        const content = `Solicitação: ${request}\nTarefa: ${brief}\nQuadro: ${JSON.stringify(board)}`;
        if (role === "planejador") {
          const result = await modelFactory().invoke([
            ["system", prompts.planejador],
            ["user", content],
          ], { callbacks: [counter] });
          return roleResultSchema.parse({ content: lastText([result]), status: "complete" });
        }
        if (!dependencies.pendingActions) throw new Error("Team approval service is unavailable.");
        const toolsForTeam = dependencies.operationalStore
          ? createOperationalTools(dependencies.operationalStore, fetch, dependencies.pendingActions)
          : getDefaultOperationalTools(dependencies.pendingActions);
        const tools: StructuredToolInterface[] = role === "analista"
          ? [toolsForTeam.listAlerts, toolsForTeam.listIncidents, toolsForTeam.consultarRunbook, toolsForTeam.check_provider_status]
          : [toolsForTeam.listIncidents, toolsForTeam.openIncident, toolsForTeam.resolveIncident];
        const agent = dependencies.agentFactory
          ? dependencies.agentFactory(role, tools, prompts[role])
          : createReactAgent({ llm: modelFactory(), tools, prompt: prompts[role], contextSchema });
        const result = await agent.invoke(
          { messages: [new HumanMessage(content)] },
          { callbacks: [counter], recursionLimit: 25, context: { userId, requestId } },
        );
        const messages = z.array(z.unknown()).parse(result.messages).map((message) => {
          if (!(message instanceof BaseMessage)) throw new Error("Team worker returned an invalid message.");
          return message;
        });
        let pending = false;
        for (const message of messages) {
          if (!(message instanceof ToolMessage)) continue;
          if (message.status === "error") throw new Error(`Team tool ${message.name ?? ""} failed.`);
          if (role === "executor" && (message.name === "open_incident" || message.name === "resolve_incident")) {
            const result = z.object({ status: z.literal("pending") }).passthrough().parse(
              JSON.parse(z.string().parse(message.content)),
            );
            pending ||= result.status === "pending";
          }
        }
        return roleResultSchema.parse({
          content: lastText(messages),
          status: pending ? "pending" : "complete",
        });
      };

      const graph = new StateGraph(stateSchema)
        .addNode("supervisor", async (state) => {
          const raw: unknown = dependencies.supervisor
            ? await dependencies.supervisor({ input: request, board: state.board })
            : await modelFactory().withStructuredOutput(decisionSchema).invoke([
              ["system", SUPERVISOR_PROMPT],
              ["user", `Solicitação: ${request}\nQuadro: ${JSON.stringify(state.board)}`],
            ], { callbacks: [counter] });
          const decision = decisionSchema.parse(raw);
          if (decision.next !== "done" && state.count >= 8) {
            const pending = state.board.some((entry) => entry.status === "pending");
            return {
              next: "done" as const,
              answer: "Investigação incompleta: limite de oito despachos atingido." +
                (pending ? " Há operação pendente de aprovação, ainda não executada." : ""),
            };
          }
          const event = traceEventSchema.parse({
            sequence: state.trace.length, node: "supervisor", type: "handoff",
            from: "supervisor", to: decision.next, brief: decision.brief,
          });
          return {
            next: decision.next, brief: decision.brief, trace: [...state.trace, event],
            count: state.count + (decision.next === "done" ? 0 : 1),
            answer: decision.next === "done" ? decision.brief : "",
          };
        })
        .addNode("worker", async (state) => {
          const role = roleSchema.parse(state.next);
          const result = await runWorker(role, state.brief, state.board);
          const entry = boardEntrySchema.parse({
            ...result, role,
            kind: role === "analista" ? "observations" : role === "planejador" ? "plan" : "operation",
          });
          return {
            board: [...state.board, entry],
            ...(entry.status === "pending" ? {
              answer: "Operação pendente de aprovação; ainda não foi executada.",
            } : {}),
          };
        })
        .addEdge(START, "supervisor")
        .addConditionalEdges("supervisor", (state) => state.next === "done" ? END : "worker", {
          [END]: END, worker: "worker",
        })
        .addConditionalEdges("worker", (state) =>
          state.board.at(-1)?.status === "pending" ? END : "supervisor", {
          [END]: END, supervisor: "supervisor",
        })
        .compile();
      const state = await graph.invoke({}, { recursionLimit: 25 });
      const execution = teamExecutionSchema.parse({
        requestId, input: request, board: state.board,
        handoffs: state.count, answer: state.answer, trace: state.trace,
      });
      return reasoningResultSchema.parse({
        answer: execution.answer,
        trace: execution.trace,
        metrics: {
          llmCalls: counter.count, latencyMs: elapsed(),
          ...(counter.promptTokens === undefined ? {} : { promptTokens: counter.promptTokens }),
          ...(counter.completionTokens === undefined ? {} : { completionTokens: counter.completionTokens }),
        },
      });
    },
  };
}
