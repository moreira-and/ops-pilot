import assert from "node:assert/strict";
import test from "node:test";
import { createLogger } from "../obs/logger.js";
import { SqliteRequestTraceStore } from "../store/sqlite-request-trace-store.js";
import { createRequestTraceService } from "./request-trace-service.js";

test("starts and completes a request with its final route and metrics", () => {
  const store = new SqliteRequestTraceStore(":memory:");
  const lines: string[] = [];
  const service = createRequestTraceService(
    store,
    createLogger((line) => lines.push(line)),
  );
  const context = service.begin("operator-1");

  assert.match(context.requestId, /^[0-9a-f-]{36}$/);
  service.complete(context, {
    route: "react",
    metrics: {
      llmCalls: 1,
      latencyMs: 25,
      promptTokens: 10,
      completionTokens: 4,
      modelUsed: "provider/model",
    },
    trace: [{
      sequence: 0,
      node: "response",
      type: "answer",
      content: "secret trace content",
    }],
  });

  const record = service.get(context.requestId);
  assert.equal(record.request.userId, "operator-1");
  assert.equal(record.request.route, "react");
  assert.equal(record.request.modelUsed, "provider/model");
  assert.equal(record.request.promptTokens, 10);
  assert.equal(record.request.completionTokens, 4);
  assert.equal(record.request.status, "ok");
  assert.equal(record.trace.length, 1);
  assert.equal(lines.length, 2);
  const loggedEvents = lines.map((line) =>
    JSON.parse(line) as { requestId: string; type: string }
  );
  assert.deepEqual(loggedEvents.map(({ type }) => type), ["start", "done"]);
  assert.ok(loggedEvents.every(({ requestId }) =>
    requestId === context.requestId
  ));
  assert.equal(lines.join("").includes("secret trace content"), false);
  assert.throws(() => service.complete(context, {
    route: "react",
    metrics: { llmCalls: 1, latencyMs: 25 },
    trace: [],
  }), /was not persisted/);
  store.close();
});

test("uses distinct IDs and records failures without exception text", () => {
  const store = new SqliteRequestTraceStore(":memory:");
  const lines: string[] = [];
  const service = createRequestTraceService(
    store,
    createLogger((line) => lines.push(line)),
  );
  const first = service.begin("operator-1");
  const second = service.begin("operator-1");

  assert.notEqual(first.requestId, second.requestId);
  assert.throws(() => service.fail(second, "sensitive provider detail"));
  service.fail(first, "MODEL_UNAVAILABLE");

  const record = service.get(first.requestId);
  assert.equal(record.request.status, "failed");
  assert.equal(record.request.errorCode, "MODEL_UNAVAILABLE");
  assert.equal(JSON.stringify(record).includes("secret"), false);
  assert.equal(lines.length, 3);
  assert.equal(lines[2]?.includes("MODEL_UNAVAILABLE"), true);
  assert.equal(lines.join("").includes("exception text"), false);
  store.close();
});

test("rejects malformed or unknown request IDs as not found", () => {
  const store = new SqliteRequestTraceStore(":memory:");
  const service = createRequestTraceService(store, createLogger(() => {}));

  assert.throws(() => service.get("not-a-uuid"), { name: "RequestNotFoundError" });
  assert.throws(
    () => service.get("00000000-0000-4000-8000-000000000001"),
    { name: "RequestNotFoundError" },
  );
  store.close();
});
