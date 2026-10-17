import { ChatOpenAI } from "@langchain/openai";

export interface ModelConfig {
  apiKey: string;
  model: string;
  baseURL: string;
  temperature: 0;
}

export class ModelConfigurationError extends Error {
  constructor(setting: string) {
    super(`Missing required model setting: ${setting}`);
    this.name = "ModelConfigurationError";
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
  return {
    apiKey,
    model,
    baseURL: "https://openrouter.ai/api/v1",
    temperature: 0,
  };
}

export function createModel(env: NodeJS.ProcessEnv = process.env): ChatOpenAI {
  const config = getModelConfig(env);
  return new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    configuration: { baseURL: config.baseURL },
    temperature: config.temperature,
    maxRetries: 0,
  });
}
