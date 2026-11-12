import { z } from "zod";

export const modelPriceSchema = z.object({
  modelId: z.string().min(1).refine((value) => value.trim().length > 0),
  inputUsdPerMillion: z.number().finite().nonnegative(),
  outputUsdPerMillion: z.number().finite().nonnegative(),
}).strict();

export const modelPriceTableSchema = z.array(modelPriceSchema).superRefine(
  (prices, context) => {
    const seen = new Set<string>();
    for (const [index, price] of prices.entries()) {
      if (seen.has(price.modelId)) {
        context.addIssue({
          code: "custom",
          path: [index, "modelId"],
          message: "Model IDs must be unique.",
        });
      }
      seen.add(price.modelId);
    }
  },
);

export type ModelPrice = z.infer<typeof modelPriceSchema>;

export const LOCAL_MODEL_PRICES: readonly ModelPrice[] =
  modelPriceTableSchema.parse([]);
