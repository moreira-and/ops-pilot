import { z } from "zod";
import type { OperationalStore } from "./operational-store.js";

const alertQuerySchema = z.object({
  status: z.enum(["firing", "resolved", "all"]).default("firing"),
});

export class AlertService {
  constructor(private readonly store: OperationalStore) {}

  async listAlerts(input: unknown) {
    const { status } = alertQuerySchema.parse(input);
    return this.store.listAlerts(status);
  }
}
