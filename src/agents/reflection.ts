import { z } from "zod";
import { createModel, ModelUnavailableError } from "./model.js";
import { ModelCallCounter, startTimer, sumPromptTokens } from "./metrics.js";
import {
  reasoningInputSchema,
  reasoningMetricsSchema,
  reasoningOptionsSchema,
  reasoningResultSchema,
  traceEventSchema,
  type ReasoningOptions,
  type ReasoningResult,
  type ReasoningStrategy,
  type TraceEvent,
} from "./reasoning.js";

export const reflectionOptionsSchema = z.object({
  maxReflections: z.number().int().safe().nonnegative().default(2),
  modelFactory: z.custom<typeof createModel>(
    (value) => typeof value === "function",
  ).optional(),
});

export const verdictSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().describe(
    "Se reprovado, indique correções específicas e acionáveis.",
  ),
});

export const CRITIC_PROMPT =
  "Avalie a resposta APENAS com base nas observações fornecidas no trace. " +
  "Não use conhecimento externo nem infira fatos que não estejam nas observações. " +
  "Aprove somente se a resposta for sustentada pelas observações. " +
  "Se reprovar, forneça feedback específico e acionável para corrigir a resposta.";

export type ReflectionOptions = z.input<typeof reflectionOptionsSchema>;

export interface ReflectionDependencies {
  critique?: (
    input: string,
    result: ReasoningResult,
    counter: ModelCallCounter,
  ) => Promise<unknown>;
}

type CritiqueTraceEvent = Extract<TraceEvent, { type: "critique" }> & {
  approved: boolean;
  feedback: string;
};

export function observationsOf(trace: readonly TraceEvent[]): string {
  return trace
    .filter((event) => event.type === "observation")
    .map((event) => {
      const source = event.tool ? `${event.tool}: ` : "";
      const error = event.error ? " (erro observado)" : "";
      return `${source}${event.content}${error}`;
    })
    .join("\n");
}

export function criticMessages(
  input: string,
  result: ReasoningResult,
): [["system", string], ["user", string]] {
  return [
    ["system", CRITIC_PROMPT],
    [
      "user",
      `Pedido: ${input}\nObservações: ${observationsOf(result.trace)}\nResposta: ${result.answer}`,
    ],
  ];
}

function reflectionInput(input: string, feedback: string): string {
  return `${input}\n\nFeedback da reflexão anterior (resposta reprovada):\n${feedback}`;
}

function criticFailureMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return "The critic returned invalid structured output.";
  }
  if (
    error instanceof Error &&
    error.name === "ModelConfigurationError"
  ) {
    return error.message;
  }
  return "The reflection critic request failed.";
}

export function withReflection(
  strategy: ReasoningStrategy,
  options: ReflectionOptions = {},
  dependencies: ReflectionDependencies = {},
): ReasoningStrategy {
  const { maxReflections, modelFactory } = reflectionOptionsSchema.parse(options);
  let model: ReturnType<typeof createModel> | undefined;
  const critic = dependencies.critique ?? (
    async (
      input: string,
      result: ReasoningResult,
      counter: ModelCallCounter,
    ) => {
      model ??= (modelFactory ?? createModel)();
      return model.withStructuredOutput(verdictSchema).invoke(
        criticMessages(input, result),
        { callbacks: [counter] },
      );
    }
  );

  return {
    name: `reflect:${strategy.name}`,
    async run(input: string, runOptions?: ReasoningOptions) {
      const request = reasoningInputSchema.parse(input);
      const parsedRunOptions = reasoningOptionsSchema.parse(runOptions ?? {});
      const elapsed = startTimer();
      const trace: TraceEvent[] = [];
      const criticCounter = new ModelCallCounter();
      let strategyCalls = 0;
      let strategyPromptTokens: number | undefined;

      const appendTrace = (events: readonly TraceEvent[]) => {
        for (const event of events) {
          const { sequence: _sequence, ...details } = traceEventSchema.parse(event);
          trace.push(
            traceEventSchema.parse({
              ...details,
              sequence: trace.length,
            }),
          );
        }
      };

      const withTokens = (promptTokens: number | undefined) =>
        promptTokens === undefined ? {} : { promptTokens };

      const makeResult = (answer: string): ReasoningResult =>
        reasoningResultSchema.parse({
          answer,
          trace,
          metrics: reasoningMetricsSchema.parse({
            llmCalls: strategyCalls + criticCounter.count,
            latencyMs: elapsed(),
            ...withTokens(
              sumPromptTokens(strategyPromptTokens, criticCounter.promptTokens),
            ),
          }),
        });

      let candidate = reasoningResultSchema.parse(
        await strategy.run(request, parsedRunOptions),
      );
      strategyCalls += candidate.metrics.llmCalls;
      strategyPromptTokens = sumPromptTokens(strategyPromptTokens, candidate.metrics.promptTokens);
      appendTrace(candidate.trace);

      if (candidate.answer.startsWith("[FAILED]") || maxReflections === 0) {
        return reasoningResultSchema.parse({
          ...candidate,
          trace,
          metrics: {
            llmCalls: strategyCalls,
            latencyMs: elapsed(),
            ...withTokens(strategyPromptTokens),
          },
        });
      }

      for (let reflection = 0; reflection <= maxReflections; reflection += 1) {
        const candidateForCritic = reasoningResultSchema.parse({
          ...candidate,
          trace,
        });
        let verdict: z.infer<typeof verdictSchema>;
        try {
          verdict = verdictSchema.parse(
            await critic(request, candidateForCritic, criticCounter),
          );
        } catch (error) {
          if (error instanceof ModelUnavailableError) throw error;
          const message = criticFailureMessage(error);
          const failureAnswer = `[FAILED] Reflection failed: ${message}`;
          trace.push(
            traceEventSchema.parse({
              sequence: trace.length,
              type: "observation",
              node: "strategy-reflect-react",
              content: message,
              error: true,
            }),
            traceEventSchema.parse({
              sequence: trace.length + 1,
              type: "answer",
              node: "strategy-reflect-react",
              content: failureAnswer,
            }),
          );
          return makeResult(failureAnswer);
        }

        const critiqueEvent: CritiqueTraceEvent = {
          sequence: trace.length,
          type: "critique",
          node: "strategy-reflect-react",
          approved: verdict.approved,
          feedback: verdict.feedback,
        };
        trace.push(traceEventSchema.parse(critiqueEvent));

        if (verdict.approved || reflection === maxReflections) {
          return makeResult(candidate.answer);
        }

        candidate = reasoningResultSchema.parse(
          await strategy.run(
            reflectionInput(request, verdict.feedback),
            parsedRunOptions,
          ),
        );
        strategyCalls += candidate.metrics.llmCalls;
        strategyPromptTokens = sumPromptTokens(strategyPromptTokens, candidate.metrics.promptTokens);
        appendTrace(candidate.trace);
        if (candidate.answer.startsWith("[FAILED]")) {
          return makeResult(candidate.answer);
        }
      }

      throw new Error("Reflection ended without a final candidate.");
    },
  };
}
