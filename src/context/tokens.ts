export const CONTEXT_SOURCES = [
  "system",
  "summary",
  "history",
  "memories",
  "message",
] as const;

export type ContextSource = (typeof CONTEXT_SOURCES)[number];
export type ContextBreakdown = Record<ContextSource, number>;

export function estimateTokens(text: string | null | undefined): number {
  return text ? Math.ceil(text.length / 4) : 0;
}

export function estimateBreakdown(
  sources: Partial<Record<ContextSource, string | null>>,
): ContextBreakdown {
  return {
    system: estimateTokens(sources.system),
    summary: estimateTokens(sources.summary),
    history: estimateTokens(sources.history),
    memories: estimateTokens(sources.memories),
    message: estimateTokens(sources.message),
  };
}
