import { randomUUID } from "node:crypto";
import { z } from "zod";
import { EntityNotFoundError } from "./domain-error.js";
import {
  alertRecordSchema,
  demoDataSchema,
  alertFilterSchema,
  incidentFilterSchema,
  newIncidentSchema,
  runbookRecordSchema,
  serviceRecordSchema,
  type AlertFilter,
  type AlertRecord,
  type DemoData,
  type IncidentFilter,
  type IncidentRecord,
  type NewIncident,
  type OperationalStore,
  type RunbookRecord,
  type ServiceRecord,
} from "./operational-store.js";

export class InMemoryOperationalStore implements OperationalStore {
  private readonly services = new Map<string, ServiceRecord>();
  private readonly alerts = new Map<string, AlertRecord>();
  private readonly incidents = new Map<string, IncidentRecord>();
  private readonly runbooks = new Map<string, RunbookRecord>();

  constructor(
    seed: { services?: ServiceRecord[]; alerts?: DemoData["alerts"] } = {},
    runbooks: RunbookRecord[] = [],
  ) {
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
    for (const input of runbooks) {
      const runbook = runbookRecordSchema.parse(input);
      if (!this.services.has(runbook.serviceId)) {
        throw new EntityNotFoundError("Service", runbook.serviceId);
      }
      this.runbooks.set(runbook.serviceId, runbook);
    }
  }

  async listAlerts(status: AlertFilter): Promise<AlertRecord[]> {
    const filter = alertFilterSchema.parse(status);
    return [...this.alerts.values()]
      .filter((alert) => filter === "all" || alert.status === filter)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async listIncidents(status: IncidentFilter): Promise<IncidentRecord[]> {
    const filter = incidentFilterSchema.parse(status);
    return [...this.incidents.values()]
      .filter((incident) => filter === "all" || incident.status === filter)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async getRunbook(serviceId: string): Promise<RunbookRecord | null> {
    const id = z.string().trim().min(1).parse(serviceId);
    const runbook = this.runbooks.get(id);
    return runbook ? runbookRecordSchema.parse(runbook) : null;
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
      summary: null,
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

  async upsertDemoData(
    data: DemoData,
    runbooks: RunbookRecord[] = [],
  ): Promise<void> {
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
    for (const input of runbooks) {
      const runbook = runbookRecordSchema.parse(input);
      if (!this.services.has(runbook.serviceId)) {
        throw new EntityNotFoundError("Service", runbook.serviceId);
      }
      this.runbooks.set(runbook.serviceId, runbook);
    }
  }
}
