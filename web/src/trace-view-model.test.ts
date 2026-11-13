import assert from "node:assert/strict";
import test from "node:test";
import { createTraceViewModel } from "./trace-view-model.js";

const requestId = "c1d9a7f1-a944-4ace-b7d8-6ab7f7c947b1";

test("validates typed trace events and preserves the API event order", () => {
  const trace = [
    { sequence: 2, type: "answer", node: "response", content: "Done." },
    {
      sequence: 0,
      type: "route",
      node: "router",
      route: "react",
      reason: "Direct request",
      source: "router",
    },
  ];
  const model = createTraceViewModel({ requestId, trace }, requestId);

  assert.equal(model.status, "available");
  if (model.status === "available") {
    assert.deepEqual(model.events, trace);
    assert.deepEqual(model.events.map(({ sequence }) => sequence), [2, 0]);
  }
});

test("reports empty or malformed traces as unavailable", () => {
  assert.deepEqual(
    createTraceViewModel({ requestId, trace: [] }, requestId),
    { status: "unavailable", reason: "empty" },
  );
  assert.deepEqual(
    createTraceViewModel({
      requestId,
      trace: [{ sequence: -1, type: "answer", content: "Invalid" }],
    }, requestId),
    { status: "unavailable", reason: "invalid" },
  );
});

test("never associates another request's trace with the selected exchange", () => {
  assert.deepEqual(
    createTraceViewModel({
      requestId: "b81ef9a6-9465-43ad-85a8-19b4d13c6a5e",
      trace: [{ sequence: 0, type: "answer", content: "Other" }],
    }, requestId),
    { status: "unavailable", reason: "mismatch" },
  );
});
