import { randomUUID } from "node:crypto";
import { z } from "zod";
import { EntityNotFoundError } from "./domain-error.js";
import {
  alertRecordSchema,
  demoDataSchema,
  newIncidentSchema,
  serviceRecordSchema,
  type AlertFilter,
  type AlertRecord,
  type DemoData,
  type IncidentRecord,
  type NewIncident,
  type OperationalStore,
  type ServiceRecord,
} from "./operational-store.js";

export class InMemoryOperationalStore implements OperationalStore {
  private readonly services = new Map<string, ServiceRecord>();
  private readonly alerts = new Map<string, AlertRecord>();
  private readonly incidents = new Map<string, IncidentRecord>();

  constructor(seed: { services?: ServiceRecord[]; alerts?: DemoData["alerts"] } = {}) {
    for (const service of seed.services ?? []) {
      const parsed = serviceRecordSchema.parse(service);
      this.services.set(parsed.id, parsed);
    }

    const now = new Date();
    for (const alert of seed.alerts ?? []) {
      const service = this.services.get(alert.serviceId);
      if (!service) {
        throw new EntityNotFoundError("Service", alert.serviceId);
      }
      const parsed = alertRecordSchema.parse({
        ...alert,
        serviceName: service.name,
        createdAt: now,
        updatedAt: now,
      });
      this.alerts.set(parsed.id, parsed);
    }
  }

  async listAlerts(status: AlertFilter): Promise<AlertRecord[]> {
    return [...this.alerts.values()]
      .filter((alert) => status === "all" || alert.status === status)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async hasService(serviceId: string): Promise<boolean> {
    return this.services.has(serviceId);
  }

  async openIncident(input: NewIncident): Promise<IncidentRecord> {
    const parsed = newIncidentSchema.parse(input);
    const service = this.services.get(parsed.serviceId);
    if (!service) {
      throw new EntityNotFoundError("Service", parsed.serviceId);
    }
    const now = new Date();
    const incident = {
      ...parsed,
      id: randomUUID(),
      serviceName: service.name,
      status: "open" as const,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    this.incidents.set(incident.id, incident);
    return incident;
  }

  async resolveIncident(id: string): Promise<IncidentRecord> {
    const incident = this.incidents.get(z.string().trim().min(1).parse(id));
    if (!incident) {
      throw new EntityNotFoundError("Incident", id);
    }
    if (incident.status === "resolved") {
      return incident;
    }
    const now = new Date();
    const resolved = { ...incident, status: "resolved" as const, resolvedAt: now, updatedAt: now };
    this.incidents.set(resolved.id, resolved);
    return resolved;
  }

  async upsertDemoData(data: DemoData): Promise<void> {
    const parsed = demoDataSchema.parse(data);
    for (const service of parsed.services) {
      this.services.set(service.id, service);
    }
    const now = new Date();
    for (const alert of parsed.alerts) {
      const service = this.services.get(alert.serviceId);
      if (!service) {
        throw new EntityNotFoundError("Service", alert.serviceId);
      }
      this.alerts.set(
        alert.id,
        alertRecordSchema.parse({
          ...alert,
          serviceName: service.name,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
  }
}
