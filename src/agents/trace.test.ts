import assert from "node:assert/strict";
import test from "node:test";
import { formatTrace, redactToolArgs } from "./trace.js";

test("formats every trace event type in sequence and preserves escaped content", () => {
  const formatted = formatTrace([
    { sequence: 0, type: "thought", content: "Check service state" },
    {
      sequence: 1,
      type: "action",
      tool: "list_alerts",
      toolCallId: "call-1",
      args: { status: "firing" },
    },
    {
      sequence: 2,
      type: "observation",
      content: 'value with "quotes" and \\ slash',
    },
    {
      sequence: 3,
      type: "plan",
      content: "Investigate",
      steps: [{ id: "s1", description: "Check alert" }],
    },
    { sequence: 4, type: "critique", content: "No additional action needed" },
    { sequence: 5, type: "answer", content: "No active alerts." },
  ]);

  assert.match(formatted, /^1\. \{"sequence":0,"type":"thought"/);
  assert.match(formatted, /"type":"action"/);
  assert.match(formatted, /"type":"observation"/);
  assert.match(formatted, /"value with \\"quotes\\" and \\\\ slash"/);
  assert.match(formatted, /"type":"plan"/);
  assert.match(formatted, /"type":"critique"/);
  assert.match(formatted, /"type":"answer"/);
});

test("redacts sensitive fields recursively from tool arguments", () => {
  assert.deepEqual(
    redactToolArgs({
      incident: { title: "Investigate", apiKey: "secret" },
      values: [{ password: "secret" }],
    }),
    {
      incident: { title: "Investigate", apiKey: "[REDACTED]" },
      values: [{ password: "[REDACTED]" }],
    },
  );
});
