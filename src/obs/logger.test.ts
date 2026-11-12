import assert from "node:assert/strict";
import test from "node:test";
import { createLogger, type LogMetadata } from "./logger.js";

test("writes one JSON line containing only allowlisted metadata", () => {
  const lines: string[] = [];
  const log = createLogger((line) => lines.push(line));

  log.info({
    requestId: "c1d9a7f1-a944-4ace-b7d8-6ab7f7c947b1",
    node: "resposta",
    type: "done",
    route: "react",
    tokens: 12,
  });

  assert.equal(lines.length, 1);
  assert.ok(lines[0]?.endsWith("\n"));
  const event = JSON.parse(lines[0]!.trim()) as Record<string, unknown>;
  assert.equal(event.level, "info");
  assert.equal(event.requestId, "c1d9a7f1-a944-4ace-b7d8-6ab7f7c947b1");
  assert.equal(event.route, "react");
  assert.equal(event.tokens, 12);
  assert.equal(typeof event.timestamp, "string");
});

test("rejects payload and arbitrary fields without writing them", () => {
  const lines: string[] = [];
  const log = createLogger((line) => lines.push(line));
  const unsafeMetadata: unknown = {
    node: "resposta",
    type: "done",
    payload: "secret operational content",
  };

  assert.throws(() => log.info(unsafeMetadata as LogMetadata));
  assert.deepEqual(lines, []);
});
