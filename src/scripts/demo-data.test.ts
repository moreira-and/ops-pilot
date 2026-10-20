import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_ALERTS, DEMO_SERVICES } from "./demo-data.js";

test("demo seed includes five services and six alerts split three firing, three resolved", () => {
  assert.equal(DEMO_SERVICES.length, 5);
  assert.ok(DEMO_SERVICES.some(({ id }) => id === "catalog"));
  assert.ok(DEMO_SERVICES.some(({ id }) => id === "auth"));
  assert.equal(DEMO_ALERTS.length, 6);
  assert.ok(DEMO_ALERTS.some(({ serviceId }) => serviceId === "catalog"));
  assert.equal(DEMO_ALERTS.filter(({ status }) => status === "firing").length, 3);
  assert.equal(DEMO_ALERTS.filter(({ status }) => status === "resolved").length, 3);
});
