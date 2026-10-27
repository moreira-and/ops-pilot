import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessageLike,
} from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { createModel } from "./model.js";
import { ModelCallCounter, startTimer } from "./metrics.js";
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
  createForgetPreferenceTool,
  getDefaultOperationalTools,
} from "./tools.js";
import type { PreferenceMemoryStore } from "../services/preference-forget-service.js";
import { DomainError } from "../services/domain-error.js";
import { DatabaseConfigurationError } from "../models/database.js";
import { ModelConfigurationError } from "./model.js";
import { redactToolArgs } from "./trace.js";

type TraceEventInput = TraceEvent extends infer Event
  ? Event extends { sequence: number }
    ? Omit<Event, "sequence" | "node">
    : never
  : never;

interface ReactAgentInvoker {
  invoke(
    input: { messages: BaseMessageLike[] },
    config?: RunnableConfig & { context?: { userId: string } },
  ): Promise<unknown>;
}

const reactContextSchema = z.object({
  userId: z.string().trim().min(1),
});

export const MEMORY_CAPABILITY_PROMPT =
  "O OpsPilot avalia automaticamente a mensagem mais recente após uma resposta " +
  "bem-sucedida para aprender fatos duradouros e seguros para conversas futuras. " +
  "Não diga que é incapaz de registrar ou aprender preferências. Esse aprendizado " +
  "ocorre em segundo plano e você não recebe confirmação de sua conclusão nesta " +
  "resposta; portanto, nunca afirme que uma preferência já foi salva. Se a pessoa " +
  "pedir para esquecer uma preferência, use forget_preference e só confirme a " +
  "remoção quando a ferramenta retornar status deleted.";

export interface ReactStrategyDependencies {
  tools?: StructuredToolInterface[];
  memoryStore?: PreferenceMemoryStore;
  modelFactory?: typeof createModel;
  agentFactory?: (
    model: ReturnType<typeof createModel>,
    tools: StructuredToolInterface[],
    options: { contextSchema: typeof reactContextSchema; prompt: string },
  ) => ReactAgentInvoker;
}

const graphResultSchema = z.object({ messages: z.array(z.unknown()) });

export function lastText(messages: readonly BaseMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message instanceof AIMessage && (message.tool_calls ?? []).length === 0) {
      const text = messageText(message.content).trim();
      if (text) return text;
    }
  }
  return "";
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string",
    )
    .map(({ text }) => text)
    .join("");
}

function safeArgs(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return safeArgs(JSON.parse(value));
    } catch {
      return { value };
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { value };
  }
  return redactToolArgs(z.record(z.string(), z.unknown()).parse(value));
}

export function toTrace(messages: readonly BaseMessage[]): TraceEvent[] {
  const trace: TraceEvent[] = [];
  const push = (event: TraceEventInput) => {
    trace.push(
      traceEventSchema.parse({
        ...event,
        node: "strategy-react",
        sequence: trace.length,
      }),
    );
  };
  for (const message of messages) {
    if (message instanceof AIMessage) {
      for (const call of message.tool_calls ?? []) {
        push({
          type: "action",
          tool: call.name,
          toolCallId: call.id,
          args: safeArgs(call.args),
        });
      }
      continue;
    }
    if (message instanceof ToolMessage) {
      push({
        type: "observation",
        tool: message.name,
        toolCallId: message.tool_call_id,
        content: messageText(message.content),
        error: message.status === "error",
      });
    }
  }
  const answer = lastText(messages);
  if (answer) push({ type: "answer", content: answer });
  return trace;
}

function toMessages(value: unknown): BaseMessage[] {
  const parsed = graphResultSchema.parse(value);
  return parsed.messages.map((message) => {
    if (!(message instanceof BaseMessage)) {
      throw new Error("ReAct graph returned an invalid message.");
    }
    return message;
  });
}

function reactMetrics(counter: ModelCallCounter, latencyMs: number) {
  const promptTokens = counter.promptTokens;
  return {
    llmCalls: counter.count,
    latencyMs,
    ...(promptTokens === undefined ? {} : { promptTokens }),
  };
}

function failureMessage(error: unknown): string {
  if (
    error instanceof ModelConfigurationError ||
    error instanceof DatabaseConfigurationError ||
    error instanceof DomainError
  ) {
    return error.message;
  }
  if (error instanceof z.ZodError) {
    return "The model or a tool returned invalid data.";
  }
  if (error instanceof Error && /recursion limit/i.test(error.message)) {
    return "ReAct reached the configured iteration limit.";
  }
  return "An internal model or tool error occurred.";
}

export function createReactStrategy(
  dependencies: ReactStrategyDependencies = {},
): ReasoningStrategy {
  let defaultTools: StructuredToolInterface[] | undefined;
  const modelFactory = dependencies.modelFactory ?? createModel;
  const agentFactory =
    dependencies.agentFactory ??
    ((model, availableTools, options) =>
      createReactAgent({
        llm: model,
        tools: availableTools,
        ...options,
      }));

  return {
    name: "react",
    async run(input: string, options?: ReasoningOptions) {
      const parsedInput = reasoningInputSchema.parse(input);
      const { maxIterations, userId } = reasoningOptionsSchema.parse(options ?? {});
      const elapsed = startTimer();
      const counter = new ModelCallCounter();
      try {
        const tools = dependencies.tools ??
          (defaultTools ??= Object.values(getDefaultOperationalTools()));
        const availableTools = dependencies.memoryStore &&
            !tools.some(({ name }) => name === "forget_preference")
          ? [...tools, createForgetPreferenceTool(dependencies.memoryStore)]
          : tools;
        const agent = agentFactory(modelFactory(), availableTools, {
          contextSchema: reactContextSchema,
          prompt: MEMORY_CAPABILITY_PROMPT,
        });
        const state = await agent.invoke(
          { messages: [new HumanMessage(parsedInput)] },
          {
            ...(userId ? { context: { userId } } : {}),
            recursionLimit: maxIterations * 2 + 1,
            callbacks: [counter],
          },
        );
        const messages = toMessages(state);
        const answer = lastText(messages);
        if (!answer) {
          throw new Error("ReAct agent completed without a final answer.");
        }
        return reasoningResultSchema.parse({
          answer,
          trace: toTrace(messages),
          metrics: reactMetrics(counter, elapsed()),
        });
      } catch (error) {
        const answer = failureMessage(error);
        return reasoningResultSchema.parse({
          answer: `[FAILED] ${answer}`,
          trace: [
            {
              sequence: 0,
              type: "observation",
              node: "strategy-react",
              content: answer,
              error: true,
            },
            {
              sequence: 1,
              type: "answer",
              node: "strategy-react",
              content: `[FAILED] ${answer}`,
            },
          ],
          metrics: reactMetrics(counter, elapsed()),
        });
      }
    },
  };
}

export const reactStrategy = createReactStrategy();
