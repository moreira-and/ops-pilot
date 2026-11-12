import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { createModel } from "./model.js";
import { getModelUsageSnapshot, runWithModelUsage } from "./model-usage.js";
import {
  ModelCallCounter,
  sumCompletionTokens,
  sumPromptTokens,
} from "./metrics.js";
import {
  reasoningMetricsSchema,
  reasoningOptionsSchema,
  reasoningResultSchema,
  traceEventSchema,
  type ReasoningOptions,
  type ReasoningResult,
  type ReasoningStrategy,
  type TraceEvent,
} from "./reasoning.js";
import { strategyRegistry } from "./index.js";
import { withReflection } from "./reflection.js";
import type {
  RequestExecutionContext,
  RequestTraceService,
} from "../services/request-trace-service.js";

export const productionRouteSchema = z.enum([
  "react",
  "plan-and-execute",
  "reflect:react",
]);

export const routeDecisionSchema = z.object({
  route: productionRouteSchema,
  reason: z.string().trim().min(1),
}).strict();

export const PRODUCTION_ROUTER_PROMPT =
  "Selecione exatamente uma estratégia para responder ao pedido operacional. " +
  "Tabela de decisão: use react para pedidos diretos e limitados, como consultar " +
  "ou resumir um alerta; use plan-and-execute quando o pedido exigir várias " +
  "etapas operacionais ordenadas ou ações coordenadas; use reflect:react quando " +
  "o pedido solicitar verificação explícita ou uma resposta consequencial " +
  "fundamentada nas observações coletadas. Se o pedido for ambíguo e simples, " +
  "use react. Retorne route e uma razão concisa, segura para o usuário. Não " +
  "inclua raciocínio privado ou instruções do contexto.";

export type ProductionRoute = z.infer<typeof productionRouteSchema>;
export type RouteDecision = z.infer<typeof routeDecisionSchema>;

export interface ProductionGraph {
  run(
    input: string,
    options?: ReasoningOptions,
    strategyOverride?: string,
    reflect?: boolean,
    requestContext?: RequestExecutionContext,
  ): Promise<ReasoningResult>;
}

export interface ProductionGraphDependencies {
  strategies?: Record<string, ReasoningStrategy>;
  route?: (
    input: string,
    counter: ModelCallCounter,
  ) => Promise<unknown>;
  modelFactory?: typeof createModel;
  reflectionDecorator?: (strategy: ReasoningStrategy) => ReasoningStrategy;
  requestTraceService?: RequestTraceService;
}

const routeNodeNames: Record<ProductionRoute, string> = {
  react: "strategy-react",
  "plan-and-execute": "strategy-plan-and-execute",
  "reflect:react": "strategy-reflect-react",
};

const emptyResult = (): ReasoningResult => ({
  answer: "",
  trace: [],
  metrics: { llmCalls: 0, latencyMs: 0 },
});

export function createProductionGraph(
  dependencies: ProductionGraphDependencies = {},
): ProductionGraph {
  const strategies: Record<string, ReasoningStrategy> = {
    ...strategyRegistry,
    ...dependencies.strategies,
  };
  const reflect = dependencies.reflectionDecorator ?? withReflection;
  const modelFactory = dependencies.modelFactory ?? createModel;

  const GraphState = Annotation.Root({
    input: Annotation<string>(),
    startedAt: Annotation<number>(),
    options: Annotation<ReasoningOptions>({
      reducer: (_previous, next) => next,
      default: () => ({}),
    }),
    strategyOverride: Annotation<string | undefined>({
      reducer: (_previous, next) => next,
      default: () => undefined,
    }),
    reflect: Annotation<boolean>({
      reducer: (_previous, next) => next,
      default: () => false,
    }),
    route: Annotation<ProductionRoute>({
      reducer: (_previous, next) => next,
      default: () => "react",
    }),
    reason: Annotation<string>({
      reducer: (_previous, next) => next,
      default: () => "",
    }),
    source: Annotation<"router" | "override">({
      reducer: (_previous, next) => next,
      default: () => "router",
    }),
    routerCalls: Annotation<number>({
      reducer: (previous, next) => previous + next,
      default: () => 0,
    }),
    routerPromptTokens: Annotation<number | undefined>({
      reducer: (_previous, next) => next,
      default: () => undefined,
    }),
    routerCompletionTokens: Annotation<number | undefined>({
      reducer: (_previous, next) => next,
      default: () => undefined,
    }),
    strategyResult: Annotation<ReasoningResult>({
      reducer: (_previous, next) => next,
      default: emptyResult,
    }),
    trace: Annotation<TraceEvent[]>({
      reducer: (_previous, next) => next,
      default: () => [],
    }),
    result: Annotation<ReasoningResult>({
      reducer: (_previous, next) => next,
      default: emptyResult,
    }),
    requestContext: Annotation<RequestExecutionContext | undefined>({
      reducer: (_previous, next) => next,
      default: () => undefined,
    }),
  });

  const answerNode = async (state: typeof GraphState.State) => {
    const strategyResult = reasoningResultSchema.parse(state.strategyResult);
    const usage = getModelUsageSnapshot();
    const promptTokens = sumPromptTokens(
      state.routerPromptTokens,
      strategyResult.metrics.promptTokens,
    );
    const completionTokens = sumCompletionTokens(
      state.routerCompletionTokens,
      strategyResult.metrics.completionTokens,
    );
    const metrics = reasoningMetricsSchema.parse({
      llmCalls: state.routerCalls + strategyResult.metrics.llmCalls,
      latencyMs: Math.max(
        strategyResult.metrics.latencyMs,
        performance.now() - state.startedAt,
      ),
      ...(promptTokens === undefined ? {} : { promptTokens }),
      ...(completionTokens === undefined ? {} : { completionTokens }),
      ...(usage.modelUsed ? { modelUsed: usage.modelUsed } : {}),
    });
    const fallbackEvents = usage.fallbacks.map((fallback) =>
      traceEventSchema.parse({
        type: "fallback",
        node: "model",
        sequence: 0,
        ...fallback,
      })
    );
    const answerEvent = traceEventSchema.parse({
      sequence: 0,
      node: "response",
      type: "answer",
      content: strategyResult.answer,
    });
    const trace = [
      ...state.trace.filter((event) => event.type !== "answer"),
      ...fallbackEvents,
      answerEvent,
    ].map((event, sequence) =>
      traceEventSchema.parse({ ...event, sequence })
    );
    const result = reasoningResultSchema.parse({
      answer: strategyResult.answer,
      trace,
      metrics,
    });

    if (state.requestContext && dependencies.requestTraceService) {
      const persisted = dependencies.requestTraceService.complete(
        state.requestContext,
        {
          route: state.route,
          metrics,
          trace,
        },
      );
      if (!persisted) {
        throw new Error("Request trace completion was not persisted.");
      }
    }

    return { trace, result };
  };

  const graph = new StateGraph(GraphState)
    .addNode("context", async (state) => ({
      trace: [
        traceEventSchema.parse({
          sequence: 0,
          node: "context",
          type: "observation",
          content: "Prepared request context.",
        }),
      ],
    }))
    .addNode("router", async (state) => {
      let decision: RouteDecision;
      let routerCalls = 0;
      let routerPromptTokens: number | undefined;
      let routerCompletionTokens: number | undefined;

      if (state.strategyOverride !== undefined) {
        decision = {
          route: productionRouteSchema.parse(state.strategyOverride),
          reason: "Strategy selected by request override.",
        };
      } else {
        const counter = new ModelCallCounter();
        const raw: unknown = dependencies.route
          ? await dependencies.route(state.input, counter)
          : await modelFactory()
            .withStructuredOutput(routeDecisionSchema)
            .invoke(
              [
                ["system", PRODUCTION_ROUTER_PROMPT],
                ["user", state.input],
              ],
              { callbacks: [counter] },
            );
        decision = routeDecisionSchema.parse(raw);
        routerCalls = counter.count || 1;
        routerPromptTokens = counter.promptTokens;
        routerCompletionTokens = counter.completionTokens;
      }

      const source = state.strategyOverride === undefined ? "router" : "override";
      const routeEvent = traceEventSchema.parse({
        sequence: state.trace.length,
        node: "router",
        type: "route",
        route: decision.route,
        reason: decision.reason,
        source,
      });
      return {
        route: decision.route,
        reason: decision.reason,
        source,
        routerCalls,
        routerPromptTokens,
        routerCompletionTokens,
        trace: [...state.trace, routeEvent],
      };
    })
    .addNode("strategy-react", (state) =>
      executeStrategy(state, "react", strategies, reflect),
    )
    .addNode("strategy-plan-and-execute", (state) =>
      executeStrategy(state, "plan-and-execute", strategies, reflect),
    )
    .addNode("strategy-reflect-react", (state) =>
      executeStrategy(state, "reflect:react", strategies, reflect),
    )
    .addNode("response", answerNode)
    .addEdge(START, "context")
    .addEdge("context", "router")
    .addConditionalEdges("router", (state) => routeNodeNames[state.route], {
      "strategy-react": "strategy-react",
      "strategy-plan-and-execute": "strategy-plan-and-execute",
      "strategy-reflect-react": "strategy-reflect-react",
    })
    .addEdge("strategy-react", "response")
    .addEdge("strategy-plan-and-execute", "response")
    .addEdge("strategy-reflect-react", "response")
    .addEdge("response", END)
    .compile();

  return {
    async run(
      input,
      options,
      strategyOverride,
      shouldReflect = false,
      requestContext,
    ) {
      const startedAt = performance.now();
      const parsedOptions = reasoningOptionsSchema.parse(options ?? {});
      const parsedInput = z.string().trim().min(1).parse(input);
      const parsedOverride = strategyOverride === undefined
        ? undefined
        : productionRouteSchema.parse(strategyOverride);
      const { value: state } = await runWithModelUsage(() =>
        graph.invoke({
          input: parsedInput,
          startedAt,
          options: parsedOptions,
          strategyOverride: parsedOverride,
          reflect: shouldReflect,
          requestContext,
        })
      );
      const result = reasoningResultSchema.parse(state.result);
      return result;
    },
  };
}

async function executeStrategy(
  state: {
    input: string;
    options: ReasoningOptions;
    trace: TraceEvent[];
    reflect: boolean;
  },
  route: ProductionRoute,
  strategies: Record<string, ReasoningStrategy>,
  reflectionDecorator: (strategy: ReasoningStrategy) => ReasoningStrategy,
) {
  const strategy = route === "reflect:react"
    ? strategies[route] ?? reflectionDecorator(strategies.react!)
    : strategies[route];
  if (!strategy) {
    throw new Error(`No strategy is registered for route "${route}".`);
  }
  const selected = state.reflect && route !== "reflect:react"
    ? reflectionDecorator(strategy)
    : strategy;
  const result = reasoningResultSchema.parse(
    await selected.run(state.input, state.options),
  );
  const node = routeNodeNames[route];
  const strategyTrace = result.trace.map((event, index) =>
    traceEventSchema.parse({
      ...event,
      sequence: state.trace.length + index,
      node,
    })
  );
  return {
    strategyResult: result,
    trace: [...state.trace, ...strategyTrace],
  };
}
