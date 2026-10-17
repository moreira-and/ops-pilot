import { randomUUID } from "node:crypto";
import type { Sequelize } from "sequelize";
import { Alert } from "../models/alert.js";
import { Incident } from "../models/incident.js";
import { initializeOperationalModels } from "../models/operational-models.js";
import { Service } from "../models/service.js";
import { EntityNotFoundError } from "./domain-error.js";
import {
  alertRecordSchema,
  demoDataSchema,
  incidentRecordSchema,
  newIncidentSchema,
  type AlertFilter,
  type AlertRecord,
  type DemoData,
  type IncidentRecord,
  type NewIncident,
  type OperationalStore,
} from "./operational-store.js";

export class SequelizeOperationalStore implements OperationalStore {
  constructor(private readonly sequelize: Sequelize) {
    initializeOperationalModels(sequelize);
  }

  async listAlerts(status: AlertFilter): Promise<AlertRecord[]> {
    const rows = await Alert.findAll({
      ...(status === "all" ? {} : { where: { status } }),
      order: [["id", "ASC"]],
    });
    const records: AlertRecord[] = [];
    for (const row of rows) {
      const service = await Service.findByPk(row.serviceId);
      if (!service) {
        throw new EntityNotFoundError("Service", row.serviceId);
      }
      records.push(
        alertRecordSchema.parse({
          id: row.id,
          serviceId: row.serviceId,
          serviceName: service.name,
          title: row.title,
          status: row.status,
          severity: row.severity,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }),
      );
    }
    return records;
  }

  async hasService(serviceId: string): Promise<boolean> {
    return (await Service.findByPk(serviceId)) !== null;
  }

  async openIncident(input: NewIncident): Promise<IncidentRecord> {
    const parsed = newIncidentSchema.parse(input);
    const service = await Service.findByPk(parsed.serviceId);
    if (!service) {
      throw new EntityNotFoundError("Service", parsed.serviceId);
    }
    const created = await Incident.create({
      ...parsed,
      id: randomUUID(),
      status: "open",
      resolvedAt: null,
    });
    return incidentRecordSchema.parse({
      id: created.id,
      title: created.title,
      serviceId: created.serviceId,
      serviceName: service.name,
      severity: created.severity,
      status: created.status,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      resolvedAt: created.resolvedAt,
    });
  }

  async resolveIncident(id: string): Promise<IncidentRecord> {
    const incident = await Incident.findByPk(id);
    if (!incident) {
      throw new EntityNotFoundError("Incident", id);
    }
    const service = await Service.findByPk(incident.serviceId);
    if (!service) {
      throw new EntityNotFoundError("Service", incident.serviceId);
    }
    if (incident.status === "open") {
      const now = new Date();
      incident.status = "resolved";
      incident.resolvedAt = now;
      await incident.save();
    }
    return incidentRecordSchema.parse({
      id: incident.id,
      title: incident.title,
      serviceId: incident.serviceId,
      serviceName: service.name,
      severity: incident.severity,
      status: incident.status,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      resolvedAt: incident.resolvedAt,
    });
  }

  async upsertDemoData(data: DemoData): Promise<void> {
    const parsed = demoDataSchema.parse(data);
    await this.sequelize.transaction(async (transaction) => {
      for (const service of parsed.services) {
        await Service.upsert(service, { transaction });
      }
      const serviceIds = new Set(
        parsed.services.map(({ id }) => id),
      );
      for (const alert of parsed.alerts) {
        if (!serviceIds.has(alert.serviceId)) {
          const serviceExists = await Service.findByPk(alert.serviceId, { transaction });
          if (!serviceExists) {
            throw new EntityNotFoundError("Service", alert.serviceId);
          }
        }
        await Alert.upsert(alert, { transaction });
      }
    });
  }
}
