import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { performance } from "node:perf_hooks";

export class ModelCallCounter extends BaseCallbackHandler {
  name = "ops-pilot-model-call-counter";
  private readonly runIds = new Set<string>();

  get count(): number {
    return this.runIds.size;
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
