import { z } from "zod";
import {
  traceEventSchema,
  type TraceEvent,
} from "../../src/agents/reasoning.js";

export type TraceViewModel =
  | { status: "available"; requestId: string; events: TraceEvent[] }
  | {
    status: "unavailable";
    reason: "empty" | "invalid" | "mismatch";
  };

const requestIdentitySchema = z.object({
  requestId: z.string().uuid(),
});

export function createTraceViewModel(
  response: unknown,
  expectedRequestId: string,
): TraceViewModel {
  const identity = requestIdentitySchema.safeParse(response);
  if (!identity.success || !z.string().uuid().safeParse(expectedRequestId).success) {
    return { status: "unavailable", reason: "invalid" };
  }
  if (identity.data.requestId !== expectedRequestId) {
    return { status: "unavailable", reason: "mismatch" };
  }

  const trace = z.array(traceEventSchema).safeParse(
    typeof response === "object" && response !== null && "trace" in response
      ? response.trace
      : undefined,
  );
  if (!trace.success) return { status: "unavailable", reason: "invalid" };
  if (trace.data.length === 0) return { status: "unavailable", reason: "empty" };

  return {
    status: "available",
    requestId: identity.data.requestId,
    events: trace.data,
  };
}
