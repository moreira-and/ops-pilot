import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { SqliteRequestTraceStore } from "./sqlite-request-trace-store.js";

test("persists a completed request and its metrics in an in-memory database", () => {
  const store = new SqliteRequestTraceStore(":memory:");
  const id = randomUUID();
  const startedAt = new Date("2026-11-12T00:00:00.000Z");
  const completedAt = new Date("2026-11-12T00:00:00.025Z");

  store.start({ id, userId: "operator-1", startedAt });
  assert.equal(
    store.complete(
      id,
      {
        route: "react",
        modelUsed: "provider/model",
        promptTokens: 10,
        completionTokens: 4,
        latencyMs: 25,
        completedAt,
      },
      [],
    ),
    true,
  );

  assert.deepEqual(store.get(id), {
    request: {
      id,
      userId: "operator-1",
      route: "react",
      modelUsed: "provider/model",
      promptTokens: 10,
      completionTokens: 4,
      latencyMs: 25,
      status: "ok",
      startedAt,
      completedAt,
      errorCode: null,
    },
    trace: [],
  });
  store.close();
});

test("records failed requests without exposing exception messages", () => {
  const store = new SqliteRequestTraceStore(":memory:");
  const id = randomUUID();
  const startedAt = new Date("2026-11-12T00:00:00.000Z");
  const completedAt = new Date("2026-11-12T00:00:00.025Z");

  store.start({ id, userId: "operator-1", startedAt });
  store.fail(id, { completedAt, errorCode: "MODEL_UNAVAILABLE" });

  const record = store.get(id);
  assert.equal(record?.request.status, "failed");
  assert.equal(record?.request.errorCode, "MODEL_UNAVAILABLE");
  assert.equal(record?.request.userId, "operator-1");
  assert.deepEqual(record?.trace, []);
  store.close();
});

test("round-trips full trace payloads in stable sequence order", () => {
  const store = new SqliteRequestTraceStore(":memory:");
  const id = randomUUID();
  const otherId = randomUUID();
  const completedAt = new Date("2026-11-12T00:00:00.025Z");
  const trace = [
    { sequence: 9, node: "response", type: "answer" as const, content: "first" },
    { sequence: 2, node: "response", type: "answer" as const, content: "second" },
  ];

  store.start({
    id,
    userId: "operator-1",
    startedAt: new Date("2026-11-12T00:00:00.000Z"),
  });
  store.complete(id, {
    route: "react",
    modelUsed: null,
    promptTokens: null,
    completionTokens: null,
    latencyMs: 25,
    completedAt,
  }, trace);
  store.start({
    id: otherId,
    userId: "operator-2",
    startedAt: new Date("2026-11-12T00:00:00.000Z"),
  });
  store.complete(otherId, {
    route: "react",
    modelUsed: null,
    promptTokens: null,
    completionTokens: null,
    latencyMs: 25,
    completedAt,
  }, [{
    sequence: 0,
    node: "response",
    type: "answer",
    content: "other request",
  }]);

  const record = store.get(id);
  assert.deepEqual(
    record?.trace.map(({ sequence }) => sequence),
    [0, 1],
  );
  assert.deepEqual(
    record?.trace.map((event) =>
      event.type === "answer" ? event.content : undefined
    ),
    ["first", "second"],
  );
  assert.deepEqual(
    store.get(otherId)?.trace.map((event) =>
      event.type === "answer" ? event.content : undefined
    ),
    ["other request"],
  );
  store.close();
});

test("persists request lifecycle across database reopen", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ops-pilot-request-trace-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "requests.db");
  const id = randomUUID();
  const startedAt = new Date("2026-11-12T00:00:00.000Z");
  const completedAt = new Date("2026-11-12T00:00:00.025Z");

  const first = new SqliteRequestTraceStore(path);
  first.start({ id, userId: "operator-1", startedAt });
  first.complete(
    id,
    {
      route: "react",
      modelUsed: null,
      promptTokens: null,
      completionTokens: null,
      latencyMs: 25,
      completedAt,
    },
    [],
  );
  first.close();

  const reopened = new SqliteRequestTraceStore(path);
  assert.equal(reopened.get(id)?.request.status, "ok");
  assert.equal(reopened.get(id)?.request.latencyMs, 25);
  reopened.close();
});

test("migrates a legacy requests table without losing rows or prompt tokens", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ops-pilot-request-trace-legacy-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "requests.db");
  const id = randomUUID();
  const startedAt = "2026-11-12T00:00:00.000Z";
  const completedAt = "2026-11-12T00:00:00.025Z";
  const legacyDb = new DatabaseSync(path);
  legacyDb.exec(`
    CREATE TABLE requests (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      route TEXT,
      model_used TEXT,
      prompt_tokens INTEGER,
      latency_ms REAL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error_code TEXT
    )
  `);
  legacyDb.prepare(`
    INSERT INTO requests
      (id, user_id, route, model_used, prompt_tokens, latency_ms, status,
       started_at, completed_at, error_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    "operator-1",
    "react",
    "provider/model",
    10,
    25,
    "ok",
    startedAt,
    completedAt,
    null,
  );
  legacyDb.close();

  const migrated = new SqliteRequestTraceStore(path);
  const record = migrated.get(id);
  assert.equal(record?.request.promptTokens, 10);
  assert.equal(record?.request.completionTokens, null);
  assert.equal(record?.request.status, "ok");
  migrated.close();
});

test("lists only requests whose start time is within the inclusive status window", () => {
  const store = new SqliteRequestTraceStore(":memory:");
  const from = new Date("2026-11-12T00:00:00.000Z");
  const to = new Date("2026-11-12T01:00:00.000Z");
  const times = [
    new Date(from.getTime() - 1),
    from,
    to,
    new Date(to.getTime() + 1),
  ];
  const ids = times.map(() => randomUUID());

  for (const [index, startedAt] of times.entries()) {
    const id = ids[index]!;
    store.start({ id, userId: "operator-1", startedAt });
    store.complete(id, {
      route: "react",
      modelUsed: null,
      promptTokens: null,
      completionTokens: null,
      latencyMs: 1,
      completedAt: new Date(startedAt.getTime() + 1),
    }, []);
  }

  const selected = store.listForStatus(from, to);
  assert.deepEqual(selected.map(({ id }) => id), [ids[1], ids[2]]);
  store.close();
});
