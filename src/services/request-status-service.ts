import { z } from "zod";
import type { RequestStatusRecord } from "./request-trace-store.js";
import type { RequestTraceStore } from "./request-trace-store.js";
import {
  InvalidSinceParameterError,
} from "./domain-error.js";
import {
  modelPriceTableSchema,
  type ModelPrice,
} from "./model-pricing.js";
import { productionRouteSchema } from "../agents/production-graph.js";

const durationFactors: Record<string, number> = {
  m: 60_000,
  h: 60 * 60_000,
  d: 24 * 60 * 60_000,
};

function isValidDuration(value: string): boolean {
  const match = /^(\d+)([mhd])$/.exec(value);
  if (!match) return false;
  const amount = Number(match[1]);
  const factor = durationFactors[match[2]!];
  return Number.isSafeInteger(amount) &&
    amount > 0 &&
    Number.isSafeInteger(amount * factor) &&
    amount * factor <= 8.64e15;
}

export const sinceDurationSchema = z.string().refine(isValidDuration);

export const requestStatusQuerySchema = z.object({
  since: sinceDurationSchema.optional(),
});

const tokensSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  total: z.number().int().nonnegative().nullable(),
  unreportedRequests: z.number().int().nonnegative(),
}).strict();

const costSchema = z.object({
  usd: z.number().finite().nonnegative().nullable(),
  costUnavailableRequests: z.number().int().nonnegative(),
  unpricedRequests: z.number().int().nonnegative(),
}).strict();

const latencySchema = z.object({
  p50: z.number().finite().nonnegative().nullable(),
  p95: z.number().finite().nonnegative().nullable(),
}).strict();

const aggregateSchema = z.object({
  total: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  tokens: tokensSchema,
  cost: costSchema,
  latencyMs: latencySchema,
}).strict();

const routeAggregateSchema = aggregateSchema.extend({
  route: productionRouteSchema.nullable(),
}).strict();

const modelAggregateSchema = aggregateSchema.extend({
  modelUsed: z.string().min(1).nullable(),
}).strict();

export const requestStatusResponseSchema = z.object({
  since: sinceDurationSchema,
  from: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  to: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  ...aggregateSchema.shape,
  byRoute: z.array(routeAggregateSchema),
  byModel: z.array(modelAggregateSchema),
}).strict();

export type RequestStatusResponse = z.infer<typeof requestStatusResponseSchema>;

type StatusStore = Pick<RequestTraceStore, "listForStatus">;

interface CostResult {
  usd: number | null;
  unavailable: boolean;
  unpriced: boolean;
}

function requestCost(
  request: RequestStatusRecord,
  prices: ReadonlyMap<string, ModelPrice>,
): CostResult {
  if (request.modelUsed?.endsWith(":free")) {
    return { usd: 0, unavailable: false, unpriced: false };
  }
  if (request.modelUsed === null) {
    return { usd: null, unavailable: true, unpriced: false };
  }
  const price = prices.get(request.modelUsed);
  if (!price) {
    return { usd: null, unavailable: true, unpriced: true };
  }
  if (request.promptTokens === null || request.completionTokens === null) {
    return { usd: null, unavailable: true, unpriced: false };
  }
  return {
    usd: (
      request.promptTokens * price.inputUsdPerMillion +
      request.completionTokens * price.outputUsdPerMillion
    ) / 1_000_000,
    unavailable: false,
    unpriced: false,
  };
}

function nearestRank(
  values: readonly number[],
  percentile: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(percentile * sorted.length) - 1]!;
}

function aggregate(
  requests: readonly RequestStatusRecord[],
  prices: ReadonlyMap<string, ModelPrice>,
) {
  let input = 0;
  let output = 0;
  let unreportedRequests = 0;
  let costTotal = 0;
  let costUnavailableRequests = 0;
  let unpricedRequests = 0;
  const latencies: number[] = [];

  for (const request of requests) {
    if (request.promptTokens === null || request.completionTokens === null) {
      unreportedRequests += 1;
    }
    if (request.promptTokens !== null) input += request.promptTokens;
    if (request.completionTokens !== null) output += request.completionTokens;

    const cost = requestCost(request, prices);
    if (cost.unavailable) {
      costUnavailableRequests += 1;
    } else {
      costTotal += cost.usd!;
    }
    if (cost.unpriced) unpricedRequests += 1;

    if (request.status !== "running" && request.latencyMs !== null) {
      latencies.push(request.latencyMs);
    }
  }

  return {
    total: requests.length,
    errors: requests.filter(({ status }) => status === "failed").length,
    tokens: {
      input,
      output,
      total: unreportedRequests === 0 ? input + output : null,
      unreportedRequests,
    },
    cost: {
      usd: costUnavailableRequests === 0 ? costTotal : null,
      costUnavailableRequests,
      unpricedRequests,
    },
    latencyMs: {
      p50: nearestRank(latencies, 0.5),
      p95: nearestRank(latencies, 0.95),
    },
  };
}

function groupBy(
  requests: readonly RequestStatusRecord[],
  getKey: (request: RequestStatusRecord) => string | null,
): Array<[string | null, RequestStatusRecord[]]> {
  const groups = new Map<string | null, RequestStatusRecord[]>();
  for (const request of requests) {
    const key = getKey(request);
    const group = groups.get(key);
    if (group) group.push(request);
    else groups.set(key, [request]);
  }
  return [...groups.entries()].sort(([left], [right]) => {
    if (left === null) return right === null ? 0 : -1;
    if (right === null) return 1;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export function createRequestStatusService(
  store: StatusStore,
  modelPrices: readonly ModelPrice[] = [],
  clock: () => Date = () => new Date(),
) {
  const parsedPrices = modelPriceTableSchema.parse(modelPrices);
  const priceByModel = new Map(
    parsedPrices.map((price) => [price.modelId, price] as const),
  );

  return {
    getStatus(sinceInput?: string): RequestStatusResponse {
      const since = sinceInput ?? "24h";
      if (!sinceDurationSchema.safeParse(since).success) {
        throw new InvalidSinceParameterError();
      }
      const now = clock();
      const from = new Date(now.getTime() - Number(since.slice(0, -1)) *
        durationFactors[since.at(-1)!]);
      if (
        Number.isNaN(now.getTime()) ||
        Number.isNaN(from.getTime())
      ) {
        throw new InvalidSinceParameterError();
      }
      const requests = store.listForStatus(from, now);
      const summary = aggregate(requests, priceByModel);
      const byRoute = groupBy(requests, ({ route }) => route).map(
        ([route, grouped]) => ({ route, ...aggregate(grouped, priceByModel) }),
      );
      const byModel = groupBy(requests, ({ modelUsed }) => modelUsed).map(
        ([modelUsed, grouped]) => ({
          modelUsed,
          ...aggregate(grouped, priceByModel),
        }),
      );

      return requestStatusResponseSchema.parse({
        since,
        from: from.toISOString(),
        to: now.toISOString(),
        ...summary,
        byRoute,
        byModel,
      });
    },
  };
}
