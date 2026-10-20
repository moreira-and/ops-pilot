import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLOutputValue, type StatementSync } from "node:sqlite";
import { z } from "zod";
import { EntityNotFoundError } from "../services/domain-error.js";
import {
  alertRecordSchema,
  alertFilterSchema,
  demoDataSchema,
  incidentFilterSchema,
  incidentRecordSchema,
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
} from "../services/operational-store.js";

type SqlRow = Record<string, SQLOutputValue>;

const serviceIdSchema = z.string().trim().min(1);

function textField(row: SqlRow, name: string): string {
  const value = row[name];
  if (typeof value !== "string") {
    throw new Error(`SQLite returned an invalid ${name} value.`);
  }
  return value;
}

function dateField(row: SqlRow, name: string): Date {
  const value = row[name];
  if (typeof value !== "string") {
    throw new Error(`SQLite returned an invalid ${name} value.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`SQLite returned an invalid ${name} date.`);
  }
  return date;
}

function nullableTextField(row: SqlRow, name: string): string | null {
  const value = row[name];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`SQLite returned an invalid ${name} value.`);
  }
  return value;
}

function nullableDateField(row: SqlRow, name: string): Date | null {
  const value = row[name];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`SQLite returned an invalid ${name} value.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`SQLite returned an invalid ${name} date.`);
  }
  return date;
}

function mapAlert(row: SqlRow): AlertRecord {
  return alertRecordSchema.parse({
    id: textField(row, "id"),
    serviceId: textField(row, "service_id"),
    serviceName: textField(row, "service_name"),
    title: textField(row, "title"),
    status: textField(row, "status"),
    severity: textField(row, "severity"),
    createdAt: dateField(row, "created_at"),
    updatedAt: dateField(row, "updated_at"),
  });
}

function mapIncident(row: SqlRow): IncidentRecord {
  return incidentRecordSchema.parse({
    id: textField(row, "id"),
    title: textField(row, "title"),
    serviceId: textField(row, "service_id"),
    serviceName: textField(row, "service_name"),
    severity: textField(row, "severity"),
    status: textField(row, "status"),
    summary: nullableTextField(row, "summary"),
    createdAt: dateField(row, "created_at"),
    updatedAt: dateField(row, "updated_at"),
    resolvedAt: nullableDateField(row, "resolved_at"),
  });
}

function mapRunbook(row: SqlRow): RunbookRecord {
  return runbookRecordSchema.parse({
    id: textField(row, "id"),
    serviceId: textField(row, "service_id"),
    title: textField(row, "title"),
    instructions: textField(row, "instructions"),
  });
}

export class SqliteOpsStore implements OperationalStore {
  private readonly db: DatabaseSync;
  private readonly listAllAlerts: StatementSync;
  private readonly listFiringAlerts: StatementSync;
  private readonly listResolvedAlerts: StatementSync;
  private readonly listAllIncidents: StatementSync;
  private readonly listOpenIncidents: StatementSync;
  private readonly listResolvedIncidents: StatementSync;
  private readonly findService: StatementSync;
  private readonly findIncident: StatementSync;
  private readonly insertIncident: StatementSync;
  private readonly resolveOpenIncident: StatementSync;
  private readonly findRunbook: StatementSync;
  private readonly upsertService: StatementSync;
  private readonly upsertAlert: StatementSync;
  private readonly upsertRunbook: StatementSync;

  constructor(
    path = process.env.OPSPILOT_DB ?? "./data/opspilot.db",
    seed?: { data: DemoData; runbooks: RunbookRecord[] },
  ) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0)
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY NOT NULL,
        service_id TEXT NOT NULL REFERENCES services(id),
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        status TEXT NOT NULL CHECK (status IN ('firing', 'resolved')),
        severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        service_id TEXT NOT NULL REFERENCES services(id),
        severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
        status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
        summary TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS runbooks (
        id TEXT PRIMARY KEY NOT NULL,
        service_id TEXT NOT NULL UNIQUE REFERENCES services(id),
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        instructions TEXT NOT NULL CHECK (length(trim(instructions)) > 0)
      );

      CREATE INDEX IF NOT EXISTS alerts_service_id_idx ON alerts(service_id);
      CREATE INDEX IF NOT EXISTS incidents_service_id_idx ON incidents(service_id);
      CREATE INDEX IF NOT EXISTS incidents_status_created_at_idx ON incidents(status, created_at);
    `);

    this.listAllAlerts = this.db.prepare(`
      SELECT a.id, a.service_id, s.name AS service_name, a.title, a.status, a.severity,
             a.created_at, a.updated_at
      FROM alerts AS a
      JOIN services AS s ON s.id = a.service_id
      ORDER BY a.created_at, a.id
    `);
    this.listFiringAlerts = this.db.prepare(`
      SELECT a.id, a.service_id, s.name AS service_name, a.title, a.status, a.severity,
             a.created_at, a.updated_at
      FROM alerts AS a
      JOIN services AS s ON s.id = a.service_id
      WHERE a.status = 'firing'
      ORDER BY a.created_at, a.id
    `);
    this.listResolvedAlerts = this.db.prepare(`
      SELECT a.id, a.service_id, s.name AS service_name, a.title, a.status, a.severity,
             a.created_at, a.updated_at
      FROM alerts AS a
      JOIN services AS s ON s.id = a.service_id
      WHERE a.status = 'resolved'
      ORDER BY a.created_at, a.id
    `);
    this.listAllIncidents = this.db.prepare(`
      SELECT i.id, i.title, i.service_id, s.name AS service_name, i.severity, i.status,
             i.summary, i.created_at, i.updated_at, i.resolved_at
      FROM incidents AS i
      JOIN services AS s ON s.id = i.service_id
      ORDER BY i.created_at, i.rowid
    `);
    this.listOpenIncidents = this.db.prepare(`
      SELECT i.id, i.title, i.service_id, s.name AS service_name, i.severity, i.status,
             i.summary, i.created_at, i.updated_at, i.resolved_at
      FROM incidents AS i
      JOIN services AS s ON s.id = i.service_id
      WHERE i.status = 'open'
      ORDER BY i.created_at, i.rowid
    `);
    this.listResolvedIncidents = this.db.prepare(`
      SELECT i.id, i.title, i.service_id, s.name AS service_name, i.severity, i.status,
             i.summary, i.created_at, i.updated_at, i.resolved_at
      FROM incidents AS i
      JOIN services AS s ON s.id = i.service_id
      WHERE i.status = 'resolved'
      ORDER BY i.created_at, i.rowid
    `);
    this.findService = this.db.prepare(
      "SELECT id, name FROM services WHERE id = ?",
    );
    this.findIncident = this.db.prepare(`
      SELECT i.id, i.title, i.service_id, s.name AS service_name, i.severity, i.status,
             i.summary, i.created_at, i.updated_at, i.resolved_at
      FROM incidents AS i
      JOIN services AS s ON s.id = i.service_id
      WHERE i.id = ?
    `);
    this.insertIncident = this.db.prepare(
      "INSERT INTO incidents (id, title, service_id, severity, status, summary, created_at, updated_at, resolved_at) VALUES (?, ?, ?, ?, 'open', NULL, ?, ?, NULL)",
    );
    this.resolveOpenIncident = this.db.prepare(
      "UPDATE incidents SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ? AND status = 'open'",
    );
    this.findRunbook = this.db.prepare(
      "SELECT id, service_id, title, instructions FROM runbooks WHERE service_id = ?",
    );
    this.upsertService = this.db.prepare(
      "INSERT INTO services (id, name) VALUES (?, ?) ON CONFLICT(id) DO NOTHING",
    );
    this.upsertAlert = this.db.prepare(
      "INSERT INTO alerts (id, service_id, title, status, severity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    );
    this.upsertRunbook = this.db.prepare(
      "INSERT INTO runbooks (id, service_id, title, instructions) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    );

    if (seed) {
      this.seedDemoData(seed.data, seed.runbooks);
    }
  }

  async listAlerts(status: AlertFilter): Promise<AlertRecord[]> {
    const filter = alertFilterSchema.parse(status);
    const statement = filter === "all"
      ? this.listAllAlerts
      : filter === "firing"
        ? this.listFiringAlerts
        : this.listResolvedAlerts;
    return statement.all().map((row) => mapAlert(row));
  }

  async listIncidents(status: IncidentFilter): Promise<IncidentRecord[]> {
    const filter = incidentFilterSchema.parse(status);
    const statement = filter === "all"
      ? this.listAllIncidents
      : filter === "open"
        ? this.listOpenIncidents
        : this.listResolvedIncidents;
    return statement.all().map((row) => mapIncident(row));
  }

  async getRunbook(serviceId: string): Promise<RunbookRecord | null> {
    const id = serviceIdSchema.parse(serviceId);
    const row = this.findRunbook.get(id);
    return row ? mapRunbook(row) : null;
  }

  async hasService(serviceId: string): Promise<boolean> {
    return this.findService.get(serviceIdSchema.parse(serviceId)) !== undefined;
  }

  async openIncident(input: NewIncident): Promise<IncidentRecord> {
    const parsed = newIncidentSchema.parse(input);
    const service = this.findService.get(parsed.serviceId);
    if (!service) {
      throw new EntityNotFoundError("Service", parsed.serviceId);
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    this.insertIncident.run(
      id,
      parsed.title,
      parsed.serviceId,
      parsed.severity,
      now,
      now,
    );
    const row = this.findIncident.get(id);
    if (!row) {
      throw new Error(`SQLite failed to retrieve newly created incident "${id}".`);
    }
    return mapIncident(row);
  }

  async resolveIncident(id: string): Promise<IncidentRecord> {
    const incidentId = serviceIdSchema.parse(id);
    const now = new Date().toISOString();
    this.resolveOpenIncident.run(now, now, incidentId);
    const row = this.findIncident.get(incidentId);
    if (!row) {
      throw new EntityNotFoundError("Incident", incidentId);
    }
    return mapIncident(row);
  }

  async upsertDemoData(
    data: DemoData,
    runbooks: RunbookRecord[] = [],
  ): Promise<void> {
    this.seedDemoData(data, runbooks);
  }

  close(): void {
    this.db.close();
  }

  private seedDemoData(dataInput: DemoData, runbookInput: RunbookRecord[]): void {
    const data = demoDataSchema.parse(dataInput);
    const runbooks = z.array(runbookRecordSchema).parse(runbookInput);
    const now = new Date().toISOString();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const input of data.services) {
        const service = serviceRecordSchema.parse(input);
        this.upsertService.run(service.id, service.name);
      }
      for (const alert of data.alerts) {
        if (!this.findService.get(alert.serviceId)) {
          throw new EntityNotFoundError("Service", alert.serviceId);
        }
        this.upsertAlert.run(
          alert.id,
          alert.serviceId,
          alert.title,
          alert.status,
          alert.severity,
          now,
          now,
        );
      }
      for (const runbook of runbooks) {
        const serviceId = serviceIdSchema.parse(runbook.serviceId);
        if (!this.findService.get(serviceId)) {
          throw new EntityNotFoundError("Service", serviceId);
        }
        this.upsertRunbook.run(
          runbook.id,
          serviceId,
          runbook.title,
          runbook.instructions,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
