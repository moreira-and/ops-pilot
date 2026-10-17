import { z } from "zod";
import { alertStatusSchema, severitySchema } from "../agents/reasoning.js";

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
  createdAt: z.date(),
  updatedAt: z.date(),
  resolvedAt: z.date().nullable(),
});

export const newIncidentSchema = z.object({
  title: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  severity: severitySchema,
});

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
export type NewIncident = z.infer<typeof newIncidentSchema>;
export type AlertFilter = "firing" | "resolved" | "all";
export type DemoData = z.infer<typeof demoDataSchema>;

export interface OperationalStore {
  listAlerts(status: AlertFilter): Promise<AlertRecord[]>;
  hasService(serviceId: string): Promise<boolean>;
  openIncident(input: NewIncident): Promise<IncidentRecord>;
  resolveIncident(id: string): Promise<IncidentRecord>;
  upsertDemoData(data: DemoData): Promise<void>;
}
