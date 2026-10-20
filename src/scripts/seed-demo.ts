import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { DEMO_DATA } from "./demo-data.js";
import { DEMO_RUNBOOKS } from "./demo-runbooks.js";

async function seedDemo(): Promise<void> {
  const store = new SqliteOpsStore();
  try {
    await store.upsertDemoData(DEMO_DATA, DEMO_RUNBOOKS);
    const alerts = await store.listAlerts("all");
    const servicePresence = await Promise.all(
      DEMO_DATA.services.map(({ id }) => store.hasService(id)),
    );
    const serviceCount = servicePresence.filter(Boolean).length;
    const firingCount = alerts.filter(({ status }) => status === "firing").length;
    const resolvedCount = alerts.filter(({ status }) => status === "resolved").length;
    if (serviceCount !== 5 || alerts.length !== 6 || firingCount !== 3 || resolvedCount !== 3) {
      throw new Error("Demo database seed verification failed.");
    }
    console.log(
      `Demo database seed complete: ${serviceCount} services and ${alerts.length} alerts (${firingCount} firing, ${resolvedCount} resolved) loaded at ${process.env.OPSPILOT_DB ?? "./data/opspilot.db"}.`,
    );
  } finally {
    store.close();
  }
}

seedDemo().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown seed failure.";
  console.error(`Demo seed failed: ${message}`);
  process.exitCode = 1;
});
