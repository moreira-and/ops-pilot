import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { DomainError } from "../services/domain-error.js";
import { createModel } from "./model.js";
import { startTimer } from "./metrics.js";
import {
  reasoningInputSchema,
  reasoningOptionsSchema,
  reasoningResultSchema,
  traceEventSchema,
  type ReasoningOptions,
  type ReasoningStrategy,
  type TraceEvent,
} from "./reasoning.js";
import {
  listAlertsInputSchema,
  openIncidentInputSchema,
  opsTools,
  resolveIncidentInputSchema,
} from "./tools.js";
import { redactToolArgs } from "./trace.js";

export const planSchema = z.object({
  steps: z.array(z.string().trim().min(1)).max(8).describe(
    "passos curtos, ordenados, executáveis com as ferramentas disponíveis",
  ),
});

export const executorSchema = z.object({
  tool: z.enum(["list_alerts", "open_incident", "resolve_incident"]),
  args: z.record(z.string(), z.unknown()),
});

export const replannerSchema = z.object({
  decision: z.enum(["adjust", "continue", "finish"]),
  steps: z.array(z.string().trim().min(1)).max(8),
  answer: z.string(),
  critique: z.string(),
});

export const PLANNER_PROMPT =
  "Crie um plano operacional curto e ordenado para atender ao pedido. Use apenas operações disponíveis: listar alertas por status (firing, resolved ou all), abrir incidente ou resolver incidente. Retorne no máximo oito passos como instruções simples. Se nenhuma ação for necessária, retorne uma lista vazia.";

const EXECUTOR_PROMPT =
  "Escolha uma única ferramenta operacional e seus argumentos para executar exatamente o passo atual. Use list_alerts com status firing, resolved ou all; open_incident com title, service e severity (critical/high/medium/low ou sev1/sev2/sev3/sev4, em que sev1=critical, sev2=high, sev3=medium e sev4=low); ou resolve_incident com id. Não invente dados ausentes: escolha a ação mais segura e informe falhas pela ferramenta quando aplicável.";

const REPLANNER_PROMPT =
  "Revise o pedido, o plano restante e os resultados concluídos. Decida se deve ajustar (adjust) os passos restantes, seguir o plano (continue), ou encerrar (finish). Nunca repita um passo concluído nem proponha mais do que oito passos no total. Ao encerrar, forneça uma resposta concisa baseada nos resultados.";

export type PlanStep = string;
export type DoneStep = [step: string, result: string];
export type PlannerOutput = z.infer<typeof planSchema>;
export type ExecutorOutput = z.infer<typeof executorSchema>;
export type ReplannerOutput = z.infer<typeof replannerSchema>;

export interface PlanReviewInput {
  input: string;
  plan: PlanStep[];
  done: DoneStep[];
  latestObservation: string;
}

export interface PlanAndExecuteDependencies {
  planner?: (input: string) => Promise<PlannerOutput>;
  executor?: (input: string, step: PlanStep, done: DoneStep[]) => Promise<ExecutorOutput>;
  replanner?: (context: PlanReviewInput) => Promise<ReplannerOutput>;
  toolExecutor?: (
    tool: ExecutorOutput["tool"],
    args: Record<string, unknown>,
  ) => Promise<string>;
}

type TraceEventInput = TraceEvent extends infer Event
  ? Event extends { sequence: number }
    ? Omit<Event, "sequence">
    : never
  : never;

function stepKey(step: string): string {
  return step.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

class PlanExecutionError extends Error {}

class ModelInvocationError extends Error {
  constructor(
    readonly phase: "planner" | "executor" | "replanner",
    readonly cause: unknown,
  ) {
    super(`${phase} model invocation failed.`);
  }
}

function assertUniqueSteps(steps: string[]): void {
  const keys = new Set<string>();
  for (const step of steps) {
    const key = stepKey(step);
    if (keys.has(key)) {
      throw new PlanExecutionError(`Planner returned a duplicate step: "${step}".`);
    }
    keys.add(key);
  }
}

function httpStatus(error: unknown): number | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("status" in error) ||
    typeof error.status !== "number" ||
    !Number.isInteger(error.status) ||
    error.status < 400 ||
    error.status > 599
  ) {
    return undefined;
  }
  return error.status;
}

function errorMessage(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (error instanceof z.ZodError) return "Invalid tool or model output.";
  if (error instanceof PlanExecutionError) return error.message;
  if (error instanceof ModelInvocationError) {
    if (error.cause instanceof z.ZodError) {
      return `The ${error.phase} returned invalid structured output.`;
    }
    const status = httpStatus(error.cause);
    return status === undefined
      ? `The ${error.phase} model request failed.`
      : `The ${error.phase} model request failed (HTTP ${status}).`;
  }
  if (
    error instanceof Error &&
    (error.name === "ModelConfigurationError" ||
      error.name === "DatabaseConfigurationError")
  ) {
    return error.message;
  }
  return "An internal model or tool error occurred.";
}

function executeTool(
  tool: ExecutorOutput["tool"],
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (tool) {
    case "list_alerts":
      return opsTools.listAlerts.invoke(listAlertsInputSchema.parse(args));
    case "open_incident":
      return opsTools.openIncident.invoke(openIncidentInputSchema.parse(args));
    case "resolve_incident":
      return opsTools.resolveIncident.invoke(resolveIncidentInputSchema.parse(args));
  }
}

export function createPlanAndExecuteStrategy(
  dependencies: PlanAndExecuteDependencies = {},
): ReasoningStrategy {
  return {
    name: "plan-and-execute",
    async run(input: string, options?: ReasoningOptions) {
      const request = reasoningInputSchema.parse(input);
      const { maxIterations } = reasoningOptionsSchema.parse(options ?? {});
      const elapsed = startTimer();
      const trace: TraceEvent[] = [];
      let llmCalls = 0;

      const emit = (event: TraceEventInput): TraceEvent => {
        const parsed = traceEventSchema.parse({
          ...event,
          sequence: trace.length,
        });
        trace.push(parsed);
        return parsed;
      };

      try {
        const model =
          dependencies.planner && dependencies.executor && dependencies.replanner
            ? undefined
            : createModel();
        const invokeModel = async <T>(
          phase: ModelInvocationError["phase"],
          operation: () => Promise<T>,
        ): Promise<T> => {
          llmCalls += 1;
          try {
            return await operation();
          } catch (error) {
            throw new ModelInvocationError(phase, error);
          }
        };

        const planner =
          dependencies.planner ??
          (async (task: string) =>
            planSchema.parse(
              await model!.withStructuredOutput(planSchema).invoke([
                ["system", PLANNER_PROMPT],
                ["user", task],
              ]),
            ));

        const executor =
          dependencies.executor ??
          (async (task: string, step: string, done: DoneStep[]) =>
            executorSchema.parse(
              await model!.withStructuredOutput(executorSchema).invoke([
                ["system", EXECUTOR_PROMPT],
                ["user", JSON.stringify({ input: task, step, done })],
              ]),
            ));

        const replanner =
          dependencies.replanner ??
          (async (context: PlanReviewInput) =>
            replannerSchema.parse(
              await model!.withStructuredOutput(replannerSchema).invoke([
                ["system", REPLANNER_PROMPT],
                ["user", JSON.stringify(context)],
              ]),
            ));
        const runTool = dependencies.toolExecutor ?? executeTool;

        const State = Annotation.Root({
          input: Annotation<string>(),
          plan: Annotation<string[]>({
            reducer: (_previous, next) => next,
            default: () => [],
          }),
          done: Annotation<DoneStep[]>({
            reducer: (previous, next) => previous.concat(next),
            default: () => [],
          }),
          answer: Annotation<string>({
            reducer: (_previous, next) => next,
            default: () => "",
          }),
          latestObservation: Annotation<string>({
            reducer: (_previous, next) => next,
            default: () => "",
          }),
          iterations: Annotation<number>({
            reducer: (_previous, next) => next,
            default: () => 0,
          }),
          finished: Annotation<boolean>({
            reducer: (_previous, next) => next,
            default: () => false,
          }),
          trace: Annotation<TraceEvent[]>({
            reducer: (previous, next) => previous.concat(next),
            default: () => [],
          }),
        });

        const graph = new StateGraph(State)
          .addNode("planner", async (state) => {
            const { steps } = await invokeModel("planner", async () =>
              planSchema.parse(await planner(state.input)),
            );
            assertUniqueSteps(steps);
            const planEvent = emit({
              type: "plan",
              content: "Initial operational plan",
              steps: steps.map((description, index) => ({
                id: `step-${index + 1}`,
                description,
              })),
            });
            return {
              plan: steps,
              finished: steps.length === 0,
              answer: steps.length === 0
                ? "No actionable steps were identified for this request."
                : "",
              trace: [planEvent],
            };
          })
          .addNode("executor", async (state) => {
            const [step, ...remaining] = state.plan;
            if (!step) return { finished: true };

            const selected = await invokeModel("executor", async () =>
              executorSchema.parse(
                await executor(state.input, step, state.done),
              ),
            );
            const action = emit({
              type: "action",
              tool: selected.tool,
              args: redactToolArgs(selected.args),
            });
            let result: string;
            let failed = false;
            try {
              result = String(await runTool(selected.tool, selected.args));
            } catch (error) {
              result = `ERROR: ${errorMessage(error)}`;
              failed = true;
            }
            const observation = emit({
              type: "observation",
              tool: selected.tool,
              content: result,
              ...(failed ? { error: true } : {}),
            });
            const completed: DoneStep = [step, result];
            return {
              plan: remaining,
              done: [completed],
              latestObservation: result,
              iterations: state.iterations + 1,
              trace: [action, observation],
            };
          })
          .addNode("replanner", async (state) => {
            const review = await invokeModel("replanner", async () =>
              replannerSchema.parse(
                await replanner({
                  input: state.input,
                  plan: state.plan,
                  done: state.done,
                  latestObservation: state.latestObservation,
                }),
              ),
            );
            const completedKeys = new Set(state.done.map(([step]) => stepKey(step)));
            const nextPlan =
              review.decision === "adjust"
                ? review.steps.filter((step) => !completedKeys.has(stepKey(step)))
                : state.plan.filter((step) => !completedKeys.has(stepKey(step)));
            assertUniqueSteps(nextPlan);
            if (state.done.length + nextPlan.length > 8) {
              throw new PlanExecutionError(
                "The execution plan cannot exceed eight total steps.",
              );
            }
            const critique = emit({
              type: "critique",
              content: review.critique || `Replanner chose ${review.decision}.`,
            });
            const adjustedPlan =
              review.decision === "adjust"
                ? emit({
                    type: "plan",
                    content: "Adjusted operational plan",
                    steps: nextPlan.map((description, index) => ({
                      id: `step-${state.done.length + index + 1}`,
                      description,
                    })),
                  })
                : undefined;
            const finished =
              review.decision === "finish" || nextPlan.length === 0;
            return {
              plan: nextPlan,
              finished,
              answer: review.answer,
              trace: adjustedPlan ? [critique, adjustedPlan] : [critique],
            };
          })
          .addNode("finish", async (state) => {
            const fallback =
              state.iterations >= maxIterations && !state.finished
                ? "Execution stopped because the iteration limit was reached."
                : "No further useful work remains.";
            const answer = state.answer.trim() || fallback;
            const answerEvent = emit({ type: "answer", content: answer });
            return { answer, finished: true, trace: [answerEvent] };
          })
          .addEdge(START, "planner")
          .addConditionalEdges("planner", (state) =>
            state.finished ? "finish" : "executor",
          )
          .addEdge("executor", "replanner")
          .addConditionalEdges("replanner", (state) =>
            state.finished || state.iterations >= maxIterations
              ? "finish"
              : "executor",
          )
          .addEdge("finish", END)
          .compile();

        const result = await graph.invoke({ input: request });
        return reasoningResultSchema.parse({
          answer: result.answer.trim() ||
            "Execution stopped because the iteration limit was reached.",
          trace,
          metrics: { llmCalls, latencyMs: elapsed() },
        });
      } catch (error) {
        const answer = `[FAILED] Plan-and-Execute failed: ${errorMessage(error)}`;
        emit({ type: "observation", content: answer, error: true });
        emit({ type: "answer", content: answer });
        return reasoningResultSchema.parse({
          answer,
          trace,
          metrics: { llmCalls, latencyMs: elapsed() },
        });
      }
    },
  };
}

export const planAndExecuteStrategy = createPlanAndExecuteStrategy();
