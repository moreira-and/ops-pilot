import assert from "node:assert/strict";
import test from "node:test";
import { traceEventSchema } from "./reasoning.js";
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

test("formats structured reflection critiques and validates both critique variants", () => {
  const reflectionCritique = {
    sequence: 0,
    type: "critique" as const,
    approved: false,
    feedback: "Include the alert severity from the observations.",
  };

  assert.deepEqual(
    traceEventSchema.parse(reflectionCritique),
    reflectionCritique,
  );
  assert.match(formatTrace([reflectionCritique]), /"approved":false/);
  assert.match(formatTrace([reflectionCritique]), /"feedback":"Include/);
  assert.deepEqual(
    traceEventSchema.parse({
      sequence: 1,
      type: "critique",
      content: "The plan is complete.",
    }),
    {
      sequence: 1,
      type: "critique",
      content: "The plan is complete.",
    },
  );
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
