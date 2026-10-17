import type { OperationalStore } from "./operational-store.js";
import {
  newIncidentSchema,
  type IncidentRecord,
} from "./operational-store.js";
import { z } from "zod";

const incidentIdSchema = z.object({ id: z.string().trim().min(1) });

export class IncidentService {
  constructor(private readonly store: OperationalStore) {}

  async openIncident(input: unknown): Promise<IncidentRecord> {
    return this.store.openIncident(newIncidentSchema.parse(input));
  }

  async resolveIncident(input: unknown): Promise<IncidentRecord> {
    const { id } = incidentIdSchema.parse(input);
    return this.store.resolveIncident(id);
  }
}
