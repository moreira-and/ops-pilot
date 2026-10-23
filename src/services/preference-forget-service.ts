import { z } from "zod";
import type { RecalledMemory } from "../memory/memory-store.js";

export const FORGET_MINIMUM_SCORE = 0.75;
export const FORGET_SCORE_MARGIN = 0.1;
const RECALL_RELEVANCE_FLOOR = 0.3;

const preferenceInputSchema = z.string().trim().min(1).max(500);
const userIdSchema = z.string().trim().min(1);

export interface PreferenceMemoryStore {
  recall(userId: string, query: string, k?: number): Promise<RecalledMemory[]>;
  forget(userId: string, memoryId: string): boolean;
}

export type ForgetPreferenceOutcome =
  | { status: "deleted"; preference: string }
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: string[] };

export function createPreferenceForgetService(memoryStore: PreferenceMemoryStore) {
  return {
    async forget(
      userIdInput: string,
      preferenceInput: string,
    ): Promise<ForgetPreferenceOutcome> {
      const userId = userIdSchema.parse(userIdInput);
      const preference = preferenceInputSchema.parse(preferenceInput);
      const candidates = await memoryStore.recall(userId, preference, 3);
      const plausible = candidates.filter(
        (candidate) => candidate.score > RECALL_RELEVANCE_FLOOR,
      );
      const best = plausible[0];
      if (!best || best.score < FORGET_MINIMUM_SCORE) {
        return { status: "not_found" };
      }

      const competing = plausible.slice(1);
      if (
        competing.some(
          (candidate) => best.score - candidate.score < FORGET_SCORE_MARGIN,
        )
      ) {
        return {
          status: "ambiguous",
          candidates: plausible.map(({ fact }) => fact),
        };
      }

      return memoryStore.forget(userId, best.id)
        ? { status: "deleted", preference: best.fact }
        : { status: "not_found" };
    },
  };
}
