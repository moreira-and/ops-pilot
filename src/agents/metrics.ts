import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";
import { performance } from "node:perf_hooks";

export class ModelCallCounter extends BaseCallbackHandler {
  name = "ops-pilot-model-call-counter";
  private readonly runIds = new Set<string>();

  private readonly promptTokensByRun = new Map<string, number>();

  get count(): number {
    return this.runIds.size;
  }

  // Undefined means no model call reported usage.
  get promptTokens(): number | undefined {
    if (this.promptTokensByRun.size === 0) return undefined;
    let total = 0;
    for (const value of this.promptTokensByRun.values()) total += value;
    return total;
  }

  handleLLMEnd(output: LLMResult, runId: string): void {
    const tokens = extractPromptTokens(output);
    if (tokens !== undefined) this.promptTokensByRun.set(runId, tokens);
  }

  recordInvocation(runId: string): void {
    this.runIds.add(runId);
  }

  handleLLMStart(
    _llm: Parameters<NonNullable<BaseCallbackHandler["handleLLMStart"]>>[0],
    _prompts: string[],
    runId: string,
  ): void {
    this.recordInvocation(runId);
  }

  handleChatModelStart(
    _llm: Parameters<NonNullable<BaseCallbackHandler["handleChatModelStart"]>>[0],
    _messages: Parameters<NonNullable<BaseCallbackHandler["handleChatModelStart"]>>[1],
    runId: string,
  ): void {
    this.recordInvocation(runId);
  }
}

export function startTimer(): () => number {
  const started = performance.now();
  return () => Math.max(0, performance.now() - started);
}

function validTokens(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

export function extractPromptTokens(output: LLMResult): number | undefined {
  const fromLlmOutput = validTokens(
    (output.llmOutput as { tokenUsage?: { promptTokens?: unknown } } | undefined)
      ?.tokenUsage?.promptTokens,
  );
  if (fromLlmOutput !== undefined) return fromLlmOutput;
  const message = output.generations?.[0]?.[0] as
    | { message?: { usage_metadata?: { input_tokens?: unknown } } }
    | undefined;
  return validTokens(message?.message?.usage_metadata?.input_tokens);
}

export function sumPromptTokens(
  ...values: Array<number | undefined>
): number | undefined {
  const reported = values.filter((value): value is number => value !== undefined);
  return reported.length === 0
    ? undefined
    : reported.reduce((total, value) => total + value, 0);
}
