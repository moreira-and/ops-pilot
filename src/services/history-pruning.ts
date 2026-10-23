export const HISTORY_WINDOW = 8;
export const SUMMARY_BATCH = 8;

export interface PruningPlan {
  fromSequence: number;
  toSequence: number;
}

export function planPruning(input: {
  totalMessages: number;
  summarizedThrough: number;
}): PruningPlan | null {
  const expired = input.totalMessages - HISTORY_WINDOW;
  if (expired - input.summarizedThrough < SUMMARY_BATCH) return null;
  return { fromSequence: input.summarizedThrough + 1, toSequence: expired };
}
