import assert from "node:assert/strict";
import test from "node:test";
import {
  createRequestStatusService,
} from "./request-status-service.js";
import { modelPriceTableSchema } from "./model-pricing.js";
import type { RequestStatusRecord } from "./request-trace-store.js";

const now = new Date("2026-11-12T12:00:00.000Z");
const paidPrices = [{
  modelId: "provider/model",
  inputUsdPerMillion: 1,
  outputUsdPerMillion: 2,
}];

function request(
  id: string,
  overrides: Partial<RequestStatusRecord> = {},
): RequestStatusRecord {
  return {
    id,
    route: "react",
    modelUsed: "provider/model",
    promptTokens: 10,
    completionTokens: 5,
    latencyMs: 10,
    status: "ok",
    startedAt: now,
    ...overrides,
  };
}

test("defaults to 24h and aggregates running, failed, token, cost, and nearest-rank metrics", () => {
  const rows = [
    request("first", {
      promptTokens: 100,
      completionTokens: 50,
      startedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    }),
    request("second", {
      modelUsed: "provider/free:free",
      promptTokens: null,
      completionTokens: 20,
      latencyMs: 40,
      status: "failed",
    }),
    request("third", {
      route: "plan-and-execute",
      promptTokens: 1,
      completionTokens: 2,
      latencyMs: 30,
    }),
    request("fourth", {
      route: "reflect:react",
      promptTokens: 10,
      completionTokens: 10,
      latencyMs: 20,
    }),
    request("running", {
      route: null,
      modelUsed: "provider/free:free",
      promptTokens: 5,
      completionTokens: 5,
      latencyMs: null,
      status: "running",
    }),
  ];
  let queriedFrom: Date | undefined;
  let queriedTo: Date | undefined;
  const service = createRequestStatusService(
    {
      listForStatus(from, to) {
        queriedFrom = from;
        queriedTo = to;
        return rows;
      },
    },
    paidPrices,
    () => now,
  );

  const status = service.getStatus();

  assert.equal(queriedFrom?.toISOString(), "2026-11-11T12:00:00.000Z");
  assert.equal(queriedTo?.toISOString(), now.toISOString());
  assert.equal(status.since, "24h");
  assert.equal(status.total, 5);
  assert.equal(status.errors, 1);
  assert.deepEqual(status.tokens, {
    input: 116,
    output: 87,
    total: null,
    unreportedRequests: 1,
  });
  assert.ok(Math.abs((status.cost.usd ?? 0) - 0.000235) < 1e-12);
  assert.equal(status.cost.costUnavailableRequests, 0);
  assert.equal(status.cost.unpricedRequests, 0);
  assert.deepEqual(status.latencyMs, { p50: 20, p95: 40 });
});

test("distinguishes unpriced, incomplete, and unknown-model costs", () => {
  const service = createRequestStatusService(
    {
      listForStatus: () => [
        request("unpriced", {
          modelUsed: "provider/unpriced",
          promptTokens: 10,
          completionTokens: 5,
        }),
        request("incomplete", { completionTokens: null }),
        request("unknown-model", { modelUsed: null }),
        request("free-incomplete", {
          modelUsed: "provider/free:free",
          promptTokens: null,
          completionTokens: null,
        }),
      ],
    },
    paidPrices,
    () => now,
  );

  const status = service.getStatus("1h");

  assert.equal(status.cost.usd, null);
  assert.equal(status.cost.costUnavailableRequests, 3);
  assert.equal(status.cost.unpricedRequests, 1);
  assert.equal(status.tokens.unreportedRequests, 2);
});

test("returns zero totals and null percentiles for an empty window", () => {
  const service = createRequestStatusService(
    { listForStatus: () => [] },
    paidPrices,
    () => now,
  );

  assert.deepEqual(service.getStatus("15m"), {
    since: "15m",
    from: "2026-11-12T11:45:00.000Z",
    to: now.toISOString(),
    total: 0,
    errors: 0,
    tokens: {
      input: 0,
      output: 0,
      total: 0,
      unreportedRequests: 0,
    },
    cost: {
      usd: 0,
      costUnavailableRequests: 0,
      unpricedRequests: 0,
    },
    latencyMs: { p50: null, p95: null },
    byRoute: [],
    byModel: [],
  });
});

test("rejects malformed, non-positive, and unsafe durations", () => {
  const service = createRequestStatusService(
    { listForStatus: () => [] },
    [],
    () => now,
  );

  for (const since of ["", "0h", "-1h", "24w", "9007199254740991d"]) {
    assert.throws(() => service.getStatus(since));
  }
});

test("validates exact unique model IDs and finite non-negative price rates", () => {
  assert.equal(modelPriceTableSchema.safeParse([
    { modelId: "provider/model", inputUsdPerMillion: 0, outputUsdPerMillion: 1 },
    { modelId: "provider/model:free", inputUsdPerMillion: 2, outputUsdPerMillion: 3 },
  ]).success, true);
  assert.equal(modelPriceTableSchema.safeParse([
    { modelId: "provider/model", inputUsdPerMillion: 1, outputUsdPerMillion: 1 },
    { modelId: "provider/model", inputUsdPerMillion: 2, outputUsdPerMillion: 2 },
  ]).success, false);
  assert.equal(modelPriceTableSchema.safeParse([
    { modelId: "provider/model", inputUsdPerMillion: Number.POSITIVE_INFINITY, outputUsdPerMillion: 1 },
  ]).success, false);
  assert.equal(modelPriceTableSchema.safeParse([
    { modelId: "provider/model", inputUsdPerMillion: -1, outputUsdPerMillion: 1 },
  ]).success, false);
});

test("groups aggregates by nullable route and model keys in deterministic order", () => {
  const service = createRequestStatusService(
    {
      listForStatus: () => [
        request("null-route", {
          route: null,
          modelUsed: "z-model",
          promptTokens: 100,
          completionTokens: 50,
          latencyMs: 20,
        }),
        request("free-incomplete", {
          route: "react",
          modelUsed: "a-model:free",
          promptTokens: null,
          completionTokens: 7,
          latencyMs: 50,
          status: "failed",
        }),
        request("free-complete", {
          route: "react",
          modelUsed: "a-model:free",
          promptTokens: 3,
          completionTokens: 4,
          latencyMs: 10,
        }),
        request("unknown-model", {
          route: "plan-and-execute",
          modelUsed: null,
          promptTokens: 2,
          completionTokens: 3,
          latencyMs: null,
          status: "running",
        }),
      ],
    },
    [{ modelId: "z-model", inputUsdPerMillion: 1, outputUsdPerMillion: 2 }],
    () => now,
  );

  const status = service.getStatus();

  assert.deepEqual(status.byRoute.map(({ route }) => route), [
    null,
    "plan-and-execute",
    "react",
  ]);
  assert.equal(status.byRoute[0]?.cost.usd, 0.0002);
  assert.equal(status.byRoute[1]?.cost.costUnavailableRequests, 1);
  assert.equal(status.byRoute[2]?.errors, 1);
  assert.equal(status.byRoute[2]?.tokens.total, null);
  assert.equal(status.byRoute[2]?.cost.usd, 0);

  assert.deepEqual(status.byModel.map(({ modelUsed }) => modelUsed), [
    null,
    "a-model:free",
    "z-model",
  ]);
  assert.equal(status.byModel[0]?.cost.costUnavailableRequests, 1);
  assert.equal(status.byModel[1]?.cost.usd, 0);
  assert.equal(status.byModel[1]?.tokens.unreportedRequests, 1);
  assert.equal(status.byModel[2]?.cost.usd, 0.0002);
});
