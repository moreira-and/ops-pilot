import { AsyncLocalStorage } from "node:async_hooks";

export interface FallbackRecord {
  from: string;
  to: string;
  reason: string;
}

export interface ModelUsage {
  modelUsed?: string;
  fallbacks: FallbackRecord[];
}

const storage = new AsyncLocalStorage<ModelUsage>();

export async function runWithModelUsage<T>(
  operation: () => Promise<T>,
): Promise<{ value: T; usage: ModelUsage }> {
  const usage: ModelUsage = { fallbacks: [] };
  const value = await storage.run(usage, operation);
  return { value, usage };
}

export function recordModelUsed(model: string): void {
  const usage = storage.getStore();
  if (usage) usage.modelUsed = model;
}

export function recordFallback(record: FallbackRecord): void {
  storage.getStore()?.fallbacks.push(record);
}

const TRANSIENT_STATUS = new Set([408, 409, 425, 429]);
const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const value = typeof status === "number" ? status : statusCode;
  return typeof value === "number" ? value : undefined;
}

// Transient failures are worth retrying or sending to the fallback model.
export function isTransientModelError(error: unknown): boolean {
  const status = errorStatus(error);
  if (status !== undefined) return status >= 500 || TRANSIENT_STATUS.has(status);
  if (typeof error !== "object" || error === null) return false;
  const { code, name, cause } = error as {
    code?: unknown;
    name?: unknown;
    cause?: unknown;
  };
  if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;
  if (
    typeof name === "string" &&
    /Timeout|Connection|APIConnectionError|AbortError/i.test(name)
  ) {
    return true;
  }
  return cause !== undefined && cause !== error && isTransientModelError(cause);
}

// Short, secret-free description of a model failure for traces.
export function sanitizeReason(error: unknown): string {
  const status = errorStatus(error);
  if (status !== undefined) return `HTTP ${status}`;
  if (typeof error === "object" && error !== null) {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === "string" && /^[A-Z_]+$/.test(code)) return code;
    if (typeof name === "string" && name) return name;
  }
  return "model error";
}
