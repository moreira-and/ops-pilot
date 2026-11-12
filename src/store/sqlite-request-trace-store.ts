import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  DatabaseSync,
  type SQLOutputValue,
  type StatementSync,
} from "node:sqlite";
import { z } from "zod";
import { RequestNotFoundError } from "../services/domain-error.js";
import {
  requestRecordSchema,
  requestStatusRecordSchema,
  requestTraceCompletionSchema,
  requestTraceFailureSchema,
  requestTraceRecordSchema,
  requestTraceStartSchema,
  traceEventRecordSchema,
  type RequestTraceCompletion,
  type RequestTraceFailure,
  type RequestTraceRecord,
  type RequestTraceStart,
  type RequestStatusRecord,
  type RequestTraceStore,
} from "../services/request-trace-store.js";
import { traceEventSchema, type TraceEvent } from "../agents/reasoning.js";

type SqlRow = Record<string, SQLOutputValue>;

const requestIdSchema = z.string().uuid();

function textField(row: SqlRow, name: string): string {
  const value = row[name];
  if (typeof value !== "string") {
    throw new Error(`SQLite returned an invalid ${name} value.`);
  }
  return value;
}

function nullableTextField(row: SqlRow, name: string): string | null {
  const value = row[name];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`SQLite returned an invalid ${name} value.`);
  }
  return value;
}

function numberField(row: SqlRow, name: string): number {
  const value = row[name];
  if (typeof value !== "number") {
    throw new Error(`SQLite returned an invalid ${name} value.`);
  }
  return value;
}

function nullableNumberField(row: SqlRow, name: string): number | null {
  const value = row[name];
  if (value === null) return null;
  if (typeof value !== "number") {
    throw new Error(`SQLite returned an invalid ${name} value.`);
  }
  return value;
}

function dateField(row: SqlRow, name: string): Date {
  const value = new Date(textField(row, name));
  if (Number.isNaN(value.getTime())) {
    throw new Error(`SQLite returned an invalid ${name} date.`);
  }
  return value;
}

function nullableDateField(row: SqlRow, name: string): Date | null {
  const value = row[name];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`SQLite returned an invalid ${name} value.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`SQLite returned an invalid ${name} date.`);
  }
  return date;
}

function mapRequest(row: SqlRow) {
  return requestRecordSchema.parse({
    id: textField(row, "id"),
    userId: textField(row, "user_id"),
    route: nullableTextField(row, "route"),
    modelUsed: nullableTextField(row, "model_used"),
    promptTokens: nullableNumberField(row, "prompt_tokens"),
    completionTokens: nullableNumberField(row, "completion_tokens"),
    latencyMs: nullableNumberField(row, "latency_ms"),
    status: textField(row, "status"),
    startedAt: dateField(row, "started_at"),
    completedAt: nullableDateField(row, "completed_at"),
    errorCode: nullableTextField(row, "error_code"),
  });
}

function mapStatusRequest(row: SqlRow): RequestStatusRecord {
  return requestStatusRecordSchema.parse({
    id: textField(row, "id"),
    route: nullableTextField(row, "route"),
    modelUsed: nullableTextField(row, "model_used"),
    promptTokens: nullableNumberField(row, "prompt_tokens"),
    completionTokens: nullableNumberField(row, "completion_tokens"),
    latencyMs: nullableNumberField(row, "latency_ms"),
    status: textField(row, "status"),
    startedAt: dateField(row, "started_at"),
  });
}

function mapTraceRecord(row: SqlRow, requestId: string) {
  const payloadValue = textField(row, "payload_json");
  const payload = traceEventSchema.parse(JSON.parse(payloadValue));
  const sequence = numberField(row, "seq");
  const node = textField(row, "node");
  const type = textField(row, "type");
  if (payload.node !== node || payload.type !== type) {
    throw new Error("SQLite returned inconsistent trace event metadata.");
  }
  return traceEventRecordSchema.parse({
    requestId,
    sequence,
    node,
    type,
    payload,
    createdAt: dateField(row, "created_at"),
  });
}

export class SqliteRequestTraceStore implements RequestTraceStore {
  private readonly db: DatabaseSync;
  private readonly insertRequest: StatementSync;
  private readonly findRequest: StatementSync;
  private readonly updateCompletedRequest: StatementSync;
  private readonly updateFailedRequest: StatementSync;
  private readonly insertTraceEvent: StatementSync;
  private readonly selectTraceEvents: StatementSync;
  private readonly selectStatusRequests: StatementSync;

  constructor(path = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
        route TEXT CHECK (
          route IS NULL OR route IN ('react', 'plan-and-execute', 'reflect:react')
        ),
        model_used TEXT CHECK (model_used IS NULL OR length(trim(model_used)) > 0),
        prompt_tokens INTEGER CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
        completion_tokens INTEGER CHECK (
          completion_tokens IS NULL OR completion_tokens >= 0
        ),
        latency_ms REAL CHECK (latency_ms IS NULL OR latency_ms >= 0),
        status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        error_code TEXT
      );

      CREATE TABLE IF NOT EXISTS trace_eventos (
        request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL CHECK (seq >= 0),
        node TEXT NOT NULL CHECK (length(trim(node)) > 0),
        type TEXT NOT NULL CHECK (
          type IN (
            'thought', 'route', 'action', 'observation', 'plan',
            'critique', 'summarize', 'fallback', 'answer'
          )
        ),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        created_at TEXT NOT NULL,
        PRIMARY KEY (request_id, seq)
      );
    `);

    const requestColumns = this.db.prepare("PRAGMA table_info(requests)")
      .all() as SqlRow[];
    if (!requestColumns.some((row) => textField(row, "name") === "completion_tokens")) {
      this.db.exec(`
        ALTER TABLE requests
        ADD COLUMN completion_tokens INTEGER CHECK (
          completion_tokens IS NULL OR completion_tokens >= 0
        )
      `);
    }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_requests_started_at
      ON requests(started_at)
    `);

    this.insertRequest = this.db.prepare(`
      INSERT INTO requests
        (id, user_id, route, model_used, prompt_tokens, latency_ms, status,
         started_at, completed_at, error_code)
      VALUES (?, ?, NULL, NULL, NULL, NULL, 'running', ?, NULL, NULL)
    `);
    this.findRequest = this.db.prepare(`
      SELECT id, user_id, route, model_used, prompt_tokens, completion_tokens,
             latency_ms, status, started_at, completed_at, error_code
      FROM requests
      WHERE id = ?
    `);
    this.updateCompletedRequest = this.db.prepare(`
      UPDATE requests
      SET route = ?, model_used = ?, prompt_tokens = ?, completion_tokens = ?,
          latency_ms = ?, status = 'ok', completed_at = ?, error_code = NULL
      WHERE id = ? AND status = 'running'
    `);
    this.updateFailedRequest = this.db.prepare(`
      UPDATE requests
      SET status = 'failed', completed_at = ?, error_code = ?
      WHERE id = ? AND status IN ('running', 'ok')
    `);
    this.insertTraceEvent = this.db.prepare(`
      INSERT INTO trace_eventos
        (request_id, seq, node, type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    this.selectTraceEvents = this.db.prepare(`
      SELECT seq, node, type, payload_json, created_at
      FROM trace_eventos
      WHERE request_id = ?
      ORDER BY seq ASC
    `);
    this.selectStatusRequests = this.db.prepare(`
      SELECT id, route, model_used, prompt_tokens, completion_tokens,
             latency_ms, status, started_at
      FROM requests
      WHERE started_at >= ? AND started_at <= ?
      ORDER BY started_at ASC, id ASC
    `);
  }

  start(input: RequestTraceStart): void {
    const request = requestTraceStartSchema.parse(input);
    this.insertRequest.run(
      request.id,
      request.userId,
      request.startedAt.toISOString(),
    );
  }

  complete(
    requestIdInput: string,
    input: RequestTraceCompletion,
    traceInput: readonly TraceEvent[],
  ): boolean {
    const requestId = requestIdSchema.parse(requestIdInput);
    const completion = requestTraceCompletionSchema.parse(input);
    const trace = z.array(traceEventSchema).parse(traceInput);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const requestRow = this.findRequest.get(requestId) as SqlRow | undefined;
      if (!requestRow) {
        throw new RequestNotFoundError(requestId);
      }
      if (textField(requestRow, "status") !== "running") {
        this.db.exec("COMMIT");
        return false;
      }

      this.updateCompletedRequest.run(
        completion.route,
        completion.modelUsed,
        completion.promptTokens,
        completion.completionTokens,
        completion.latencyMs,
        completion.completedAt.toISOString(),
        requestId,
      );
      trace.forEach((event, sequence) => {
        const parsedEvent = traceEventSchema.parse(event);
        this.insertTraceEvent.run(
          requestId,
          sequence,
          parsedEvent.node,
          parsedEvent.type,
          JSON.stringify(parsedEvent),
          completion.completedAt.toISOString(),
        );
      });
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  fail(requestIdInput: string, input: RequestTraceFailure): void {
    const requestId = requestIdSchema.parse(requestIdInput);
    const failure = requestTraceFailureSchema.parse(input);
    this.updateFailedRequest.run(
      failure.completedAt.toISOString(),
      failure.errorCode,
      requestId,
    );
    if (!this.findRequest.get(requestId)) {
      throw new RequestNotFoundError(requestId);
    }
  }

  get(requestIdInput: string): RequestTraceRecord | null {
    const requestId = requestIdSchema.parse(requestIdInput);
    const requestRow = this.findRequest.get(requestId) as SqlRow | undefined;
    if (!requestRow) return null;

    const events = this.selectTraceEvents.all(requestId) as SqlRow[];
    const traceRecords = events.map((row) => mapTraceRecord(row, requestId));
    const trace = traceRecords.map(({ sequence, payload }) =>
      traceEventSchema.parse({ ...payload, sequence })
    );
    return requestTraceRecordSchema.parse({
      request: mapRequest(requestRow),
      trace,
    });
  }

  listForStatus(fromInput: Date, toInput: Date): RequestStatusRecord[] {
    const from = z.date().parse(fromInput);
    const to = z.date().parse(toInput);
    const rows = this.selectStatusRequests.all(
      from.toISOString(),
      to.toISOString(),
    ) as SqlRow[];
    return rows.map(mapStatusRequest);
  }

  close(): void {
    this.db.close();
  }
}
