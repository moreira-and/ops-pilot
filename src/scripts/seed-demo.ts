import { InMemoryOperationalStore } from "../services/in-memory-operational-store.js";
import { DEMO_DATA } from "./demo-data.js";

async function seedDemo(): Promise<void> {
  const store = new InMemoryOperationalStore();
  await store.upsertDemoData(DEMO_DATA);
  const alerts = await store.listAlerts("all");
  const servicePresence = await Promise.all(
    DEMO_DATA.services.map(({ id }) => store.hasService(id)),
  );
  const serviceCount = servicePresence.filter(Boolean).length;
  const firingCount = alerts.filter(({ status }) => status === "firing").length;
  const resolvedCount = alerts.filter(({ status }) => status === "resolved").length;
  if (serviceCount !== 6 || alerts.length !== 7 || firingCount !== 4 || resolvedCount !== 3) {
    throw new Error("Demo JSON seed verification failed.");
  }
  console.log(
    `Demo JSON seed complete: ${serviceCount} services and ${alerts.length} alerts (${firingCount} firing, ${resolvedCount} resolved) loaded in memory.`,
  );
}

seedDemo().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown seed failure.";
  console.error(`Demo seed failed: ${message}`);
  process.exitCode = 1;
});
