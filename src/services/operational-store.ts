import { z } from "zod";
import {
  alertFilterSchema,
  alertStatusSchema,
  severitySchema,
} from "../agents/reasoning.js";

export { alertFilterSchema };

export const serviceRecordSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

export const alertRecordSchema = z.object({
  id: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  serviceName: z.string().trim().min(1),
  title: z.string().trim().min(1),
  status: alertStatusSchema,
  severity: severitySchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const incidentRecordSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  serviceName: z.string().trim().min(1),
  severity: severitySchema,
  status: z.enum(["open", "resolved"]),
  summary: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  resolvedAt: z.date().nullable(),
});

export const runbookRecordSchema = z.object({
  id: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
});

export const newIncidentSchema = z.object({
  title: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  severity: severitySchema,
});

export const incidentFilterSchema = z.enum(["open", "resolved", "all"]);

export const demoDataSchema = z.object({
  services: z.array(serviceRecordSchema),
  alerts: z.array(
    z.object({
      id: z.string().trim().min(1),
      serviceId: z.string().trim().min(1),
      title: z.string().trim().min(1),
      status: alertStatusSchema,
      severity: severitySchema,
    }),
  ),
});

export type ServiceRecord = z.infer<typeof serviceRecordSchema>;
export type AlertRecord = z.infer<typeof alertRecordSchema>;
export type IncidentRecord = z.infer<typeof incidentRecordSchema>;
export type RunbookRecord = z.infer<typeof runbookRecordSchema>;
export type NewIncident = z.infer<typeof newIncidentSchema>;
export type AlertFilter = z.infer<typeof alertFilterSchema>;
export type IncidentFilter = z.infer<typeof incidentFilterSchema>;
export type DemoData = z.infer<typeof demoDataSchema>;

export interface OperationalStore {
  listAlerts(status: AlertFilter): Promise<AlertRecord[]>;
  listIncidents(status: IncidentFilter): Promise<IncidentRecord[]>;
  getRunbook(serviceId: string): Promise<RunbookRecord | null>;
  hasService(serviceId: string): Promise<boolean>;
  openIncident(input: NewIncident): Promise<IncidentRecord>;
  resolveIncident(id: string): Promise<IncidentRecord>;
  upsertDemoData(data: DemoData): Promise<void>;
}
