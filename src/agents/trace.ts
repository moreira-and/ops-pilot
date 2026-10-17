import type { TraceEvent } from "./reasoning.js";
import { z } from "zod";

export function redactToolArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const redact = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(redact);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        /token|password|secret|api.?key/i.test(key) ? "[REDACTED]" : redact(nested),
      ]),
    );
  };
  return z.record(z.string(), z.unknown()).parse(redact(args));
}

export function formatTrace(events: readonly TraceEvent[]): string {
  return events
    .map((event) => `${event.sequence + 1}. ${JSON.stringify(event)}`)
    .join("\n");
}
