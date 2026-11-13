import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  DatabaseSync,
  type SQLOutputValue,
  type StatementSync,
} from "node:sqlite";
import { z } from "zod";
import {
  pendingActionRecordSchema,
  type PendingActionRecord,
  type PendingActionStore,
} from "../services/pending-action-store.js";
import { incidentDecisionResultSchema } from "../contracts/war-room.js";

type SqlRow = Record<string, SQLOutputValue>;

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime();
const errorCodeSchema = z.string().regex(/^[A-Z0-9_]+$/).max(64);

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

function jsonField(row: SqlRow, name: string): unknown {
  return JSON.parse(textField(row, name));
}

function nullableJsonField(row: SqlRow, name: string): unknown | null {
  const value = row[name];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`SQLite returned an invalid ${name} value.`);
  }
  return JSON.parse(value);
}

function mapPendingAction(row: SqlRow): PendingActionRecord {
  return pendingActionRecordSchema.parse({
    id: textField(row, "id"),
    requestId: textField(row, "request_id"),
    userId: textField(row, "user_id"),
    kind: textField(row, "kind"),
    summary: textField(row, "summary"),
    details: jsonField(row, "details_json"),
    payload: jsonField(row, "payload_json"),
    status: textField(row, "status"),
    createdAt: textField(row, "created_at"),
    decidedAt: nullableTextField(row, "decided_at"),
    result: nullableJsonField(row, "result_json"),
    errorCode: nullableTextField(row, "error_code"),
  });
}

export class SqlitePendingActionStore implements PendingActionStore {
  private readonly db: DatabaseSync;
  private readonly insertAction: StatementSync;
  private readonly findActionById: StatementSync;
  private readonly findActionForUser: StatementSync;
  private readonly listActionsForUser: StatementSync;
  private readonly listActionsForRequest: StatementSync;
  private readonly claimAction: StatementSync;
  private readonly denyAction: StatementSync;
  private readonly approveAction: StatementSync;
  private readonly failAction: StatementSync;
  private readonly reconcileProcessing: StatementSync;

  constructor(path = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_actions (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        request_id TEXT NOT NULL CHECK (length(trim(request_id)) > 0),
        user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
        kind TEXT NOT NULL CHECK (kind IN ('open_incident', 'resolve_incident')),
        summary TEXT NOT NULL CHECK (length(trim(summary)) > 0),
        details_json TEXT NOT NULL CHECK (json_valid(details_json)),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        status TEXT NOT NULL CHECK (
          status IN (
            'pending', 'processing', 'approved', 'denied', 'failed',
            'reconciliation_required'
          )
        ),
        created_at TEXT NOT NULL,
        decided_at TEXT,
        result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
        error_code TEXT CHECK (
          error_code IS NULL OR length(trim(error_code)) > 0
        ),
        CHECK (
          (status = 'pending' AND decided_at IS NULL
            AND result_json IS NULL AND error_code IS NULL)
          OR (status = 'processing' AND decided_at IS NOT NULL
            AND result_json IS NULL AND error_code IS NULL)
          OR (status = 'approved' AND decided_at IS NOT NULL
            AND result_json IS NOT NULL AND error_code IS NULL)
          OR (status = 'denied' AND decided_at IS NOT NULL
            AND result_json IS NULL AND error_code IS NULL)
          OR (status = 'failed' AND decided_at IS NOT NULL
            AND result_json IS NULL AND error_code IS NOT NULL)
          OR (status = 'reconciliation_required' AND decided_at IS NOT NULL
            AND result_json IS NULL AND error_code IS NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS idx_pending_actions_user_status
      ON pending_actions(user_id, status, created_at, id);
      CREATE INDEX IF NOT EXISTS idx_pending_actions_request
      ON pending_actions(request_id, user_id, status);
    `);

    this.insertAction = this.db.prepare(`
      INSERT INTO pending_actions
        (id, request_id, user_id, kind, summary, details_json, payload_json,
         status, created_at, decided_at, result_json, error_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.findActionForUser = this.db.prepare(`
      SELECT id, request_id, user_id, kind, summary, details_json, payload_json,
             status, created_at, decided_at, result_json, error_code
      FROM pending_actions
      WHERE id = ? AND user_id = ?
    `);
    this.findActionById = this.db.prepare(`
      SELECT id, request_id, user_id, kind, summary, details_json, payload_json,
             status, created_at, decided_at, result_json, error_code
      FROM pending_actions
      WHERE id = ?
    `);
    this.listActionsForUser = this.db.prepare(`
      SELECT id, request_id, user_id, kind, summary, details_json, payload_json,
             status, created_at, decided_at, result_json, error_code
      FROM pending_actions
      WHERE user_id = ?
        AND status IN ('pending', 'processing', 'failed', 'reconciliation_required')
      ORDER BY created_at ASC, id ASC
    `);
    this.listActionsForRequest = this.db.prepare(`
      SELECT id, request_id, user_id, kind, summary, details_json, payload_json,
             status, created_at, decided_at, result_json, error_code
      FROM pending_actions
      WHERE request_id = ? AND user_id = ? AND status = 'pending'
      ORDER BY created_at ASC, id ASC
    `);
    this.claimAction = this.db.prepare(`
      UPDATE pending_actions
      SET status = 'processing', decided_at = ?
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `);
    this.denyAction = this.db.prepare(`
      UPDATE pending_actions
      SET status = 'denied', decided_at = ?
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `);
    this.approveAction = this.db.prepare(`
      UPDATE pending_actions
      SET status = 'approved', result_json = ?, decided_at = ?, error_code = NULL
      WHERE id = ? AND status = 'processing'
    `);
    this.failAction = this.db.prepare(`
      UPDATE pending_actions
      SET status = 'failed', result_json = NULL, decided_at = ?, error_code = ?
      WHERE id = ? AND status = 'processing'
    `);
    this.reconcileProcessing = this.db.prepare(`
      UPDATE pending_actions
      SET status = 'reconciliation_required',
          decided_at = COALESCE(decided_at, ?)
      WHERE status = 'processing'
    `);
    this.reconcileProcessing.run(new Date().toISOString());
  }

  create(input: unknown): PendingActionRecord {
    const action = pendingActionRecordSchema.parse(input);
    this.insertAction.run(
      action.id,
      action.requestId,
      action.userId,
      action.kind,
      action.summary,
      JSON.stringify(action.details),
      JSON.stringify(action.payload),
      action.status,
      action.createdAt,
      action.decidedAt,
      action.result === null ? null : JSON.stringify(action.result),
      action.errorCode,
    );
    return action;
  }

  getForUser(idInput: string, userIdInput: string): PendingActionRecord | null {
    const id = uuidSchema.parse(idInput);
    const userId = uuidSchema.parse(userIdInput);
    const row = this.findActionForUser.get(id, userId) as SqlRow | undefined;
    return row ? mapPendingAction(row) : null;
  }

  listForUser(userIdInput: string): PendingActionRecord[] {
    const userId = uuidSchema.parse(userIdInput);
    const rows = this.listActionsForUser.all(userId) as SqlRow[];
    return rows.map(mapPendingAction);
  }

  listForRequest(
    requestIdInput: string,
    userIdInput: string,
  ): PendingActionRecord[] {
    const requestId = uuidSchema.parse(requestIdInput);
    const userId = uuidSchema.parse(userIdInput);
    const rows = this.listActionsForRequest.all(requestId, userId) as SqlRow[];
    return rows.map(mapPendingAction);
  }

  claimPending(
    idInput: string,
    userIdInput: string,
    decidedAtInput: string,
  ): PendingActionRecord | null {
    const id = uuidSchema.parse(idInput);
    const userId = uuidSchema.parse(userIdInput);
    const decidedAt = timestampSchema.parse(decidedAtInput);
    const update = this.claimAction.run(decidedAt, id, userId);
    if (Number(update.changes) === 0) return null;
    return this.getForUser(id, userId);
  }

  denyPending(
    idInput: string,
    userIdInput: string,
    decidedAtInput: string,
  ): PendingActionRecord | null {
    const id = uuidSchema.parse(idInput);
    const userId = uuidSchema.parse(userIdInput);
    const decidedAt = timestampSchema.parse(decidedAtInput);
    const update = this.denyAction.run(decidedAt, id, userId);
    if (Number(update.changes) === 0) return null;
    return this.getForUser(id, userId);
  }

  completeApproved(
    idInput: string,
    resultInput: unknown,
    decidedAtInput: string,
  ): PendingActionRecord | null {
    const id = uuidSchema.parse(idInput);
    const result = incidentDecisionResultSchema.parse(resultInput);
    const decidedAt = timestampSchema.parse(decidedAtInput);
    const update = this.approveAction.run(
      JSON.stringify(result),
      decidedAt,
      id,
    );
    if (Number(update.changes) === 0) return null;
    const row = this.findActionById.get(id) as SqlRow | undefined;
    return row ? mapPendingAction(row) : null;
  }

  failProcessing(
    idInput: string,
    errorCodeInput: string,
    decidedAtInput: string,
  ): PendingActionRecord | null {
    const id = uuidSchema.parse(idInput);
    const errorCode = errorCodeSchema.parse(errorCodeInput);
    const decidedAt = timestampSchema.parse(decidedAtInput);
    const update = this.failAction.run(decidedAt, errorCode, id);
    if (Number(update.changes) === 0) return null;
    const row = this.findActionById.get(id) as SqlRow | undefined;
    return row ? mapPendingAction(row) : null;
  }

  close(): void {
    this.db.close();
  }
}
