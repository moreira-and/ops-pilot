import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import {
  BaseChatModel,
  type BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { RunnableLambda, type Runnable } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import {
  isTransientModelError,
  recordFallback,
  recordModelUsed,
  sanitizeReason,
} from "./model-usage.js";

export interface ModelConfig {
  apiKey: string;
  model: string;
  baseURL: string;
  temperature: 0;
  fallbackModel?: string;
  maxAttempts: number;
}

const MAX_ATTEMPTS = 2;

export class ModelConfigurationError extends Error {
  constructor(setting: string) {
    super(`Missing or invalid model setting: ${setting}`);
    this.name = "ModelConfigurationError";
  }
}

export class ModelUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("No configured model is available.", { cause });
    this.name = "ModelUnavailableError";
  }
}

export function getModelConfig(
  env: NodeJS.ProcessEnv = process.env,
): ModelConfig {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new ModelConfigurationError("OPENROUTER_API_KEY");
  }
  const model = env.OPENROUTES_MODEL?.trim();
  if (!model) {
    throw new ModelConfigurationError("OPENROUTES_MODEL");
  }
  const fallbackModel = env.OPENROUTER_MODEL_FALLBACK?.trim() || undefined;
  if (fallbackModel === model) {
    throw new ModelConfigurationError("OPENROUTER_MODEL_FALLBACK");
  }
  return {
    apiKey,
    model,
    baseURL: "https://openrouter.ai/api/v1",
    temperature: 0,
    ...(fallbackModel ? { fallbackModel } : {}),
    maxAttempts: MAX_ATTEMPTS,
  };
}

type ModelRunnable = Runnable<BaseLanguageModelInput, any>;
type ModelNames = { primary: string; fallback?: string };

// Chat model that retries the primary model and then falls back to a backup,
// keeping the bindTools/withStructuredOutput surface agents rely on.
export class ResilientChatModel extends BaseChatModel {
  constructor(
    private readonly primary: ChatOpenAI,
    private readonly backup: ChatOpenAI | undefined,
    private readonly names: ModelNames,
    private readonly maxAttempts: number,
  ) {
    super({});
  }

  _llmType(): string {
    return "resilient";
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
  ): Promise<ChatResult> {
    const message = await this.resilient((model) => model).invoke(messages, {
      signal: options.signal,
    });
    const text = typeof message.content === "string" ? message.content : "";
    return { generations: [{ text, message }] };
  }

  override bindTools(
    tools: Parameters<ChatOpenAI["bindTools"]>[0],
    kwargs?: Partial<BaseChatModelCallOptions>,
  ): ModelRunnable {
    return this.resilient((model) =>
      model.bindTools(tools, kwargs as Parameters<ChatOpenAI["bindTools"]>[1]) as ModelRunnable
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override withStructuredOutput(schema: any, config?: any): any {
    return this.resilient((model) =>
      (model.withStructuredOutput as (s: unknown, c?: unknown) => ModelRunnable)
        .call(model, schema, config)
    );
  }

  private resilient(build: (model: ChatOpenAI) => ModelRunnable): ModelRunnable {
    return RunnableLambda.from(async (input: BaseLanguageModelInput, config) => {
      let fatal: { error: unknown } | undefined;
      let primaryError: unknown;
      const retry = (runnable: ModelRunnable, onFail: (error: unknown) => void) =>
        runnable.withRetry({
          stopAfterAttempt: this.maxAttempts,
          onFailedAttempt: (error: unknown) => {
            onFail(error);
            if (!isTransientModelError(error)) throw error;
          },
        });

      const primaryChain = retry(build(this.primary), (error) => {
        primaryError = error;
        if (!isTransientModelError(error)) fatal = { error };
      });
      const primaryStep = RunnableLambda.from(
        async (value: BaseLanguageModelInput, cfg) => {
          const output = await primaryChain.invoke(value, cfg);
          recordModelUsed(this.names.primary);
          return output;
        },
      );

      let chain: ModelRunnable = primaryStep;
      if (this.backup && this.names.fallback) {
        const backupName = this.names.fallback;
        const backupChain = retry(build(this.backup), () => undefined);
        const backupStep = RunnableLambda.from(
          async (value: BaseLanguageModelInput, cfg) => {
            if (fatal) throw fatal.error;
            recordFallback({
              from: this.names.primary,
              to: backupName,
              reason: sanitizeReason(primaryError),
            });
            const output = await backupChain.invoke(value, cfg);
            recordModelUsed(backupName);
            return output;
          },
        );
        chain = primaryStep.withFallbacks([backupStep]);
      }

      try {
        return await chain.invoke(input, config);
      } catch (error) {
        if (fatal) throw fatal.error;
        throw new ModelUnavailableError(error);
      }
    });
  }
}

export function createModel(
  env: NodeJS.ProcessEnv = process.env,
): BaseChatModel {
  const config = getModelConfig(env);
  const build = (model: string) =>
    new ChatOpenAI({
      model,
      apiKey: config.apiKey,
      configuration: { baseURL: config.baseURL },
      temperature: config.temperature,
      maxRetries: 0,
    });
  return new ResilientChatModel(
    build(config.model),
    config.fallbackModel ? build(config.fallbackModel) : undefined,
    { primary: config.model, fallback: config.fallbackModel },
    config.maxAttempts,
  );
}
