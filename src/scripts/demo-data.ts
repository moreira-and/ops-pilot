import demoDataJson from "./demo-data.json" with { type: "json" };
import { demoDataSchema, type DemoData } from "../services/operational-store.js";

export const DEMO_DATA: DemoData = demoDataSchema.parse(demoDataJson);
export const DEMO_SERVICES = DEMO_DATA.services;
export const DEMO_ALERTS = DEMO_DATA.alerts;
