import { z } from "zod";
import {
  runbookRecordSchema,
  type OperationalStore,
} from "./operational-store.js";

const serviceIdSchema = z.string().trim().min(1);

export const runbookLookupResultSchema = z.discriminatedUnion("available", [
  z.object({
    available: z.literal(true),
    runbook: runbookRecordSchema,
  }),
  z.object({
    available: z.literal(false),
    service: z.string(),
    reason: z.enum(["unknown_service", "runbook_unavailable"]),
  }),
]);

export type RunbookLookupResult = z.infer<typeof runbookLookupResultSchema>;

export class RunbookService {
  constructor(private readonly store: OperationalStore) {}

  async getRunbook(input: unknown): Promise<RunbookLookupResult> {
    const serviceId = serviceIdSchema.parse(input);
    if (!(await this.store.hasService(serviceId))) {
      return { available: false, service: serviceId, reason: "unknown_service" };
    }
    const runbook = await this.store.getRunbook(serviceId);
    return runbook
      ? runbookLookupResultSchema.parse({ available: true, runbook })
      : {
          available: false,
          service: serviceId,
          reason: "runbook_unavailable",
        };
  }
}
