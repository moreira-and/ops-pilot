import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  DatabaseSync,
  type SQLOutputValue,
  type StatementSync,
} from "node:sqlite";
import { z } from "zod";
import {
  ConversationNotFoundError,
} from "../services/domain-error.js";
import {
  conversationMessageSchema,
  conversationSchema,
  conversationSummarySchema,
  newConversationMessageSchema,
  type Conversation,
  type ConversationMessage,
  type ConversationMessageRole,
  type ConversationStore,
  type ConversationSummary,
  type ConversationSummaryStore,
} from "../services/conversation-store.js";

type SqlRow = Record<string, SQLOutputValue>;

const conversationIdSchema = z.string().trim().min(1);
const historyLimitSchema = z.number().int().min(0).max(8);

function textField(row: SqlRow, name: string): string {
  const value = row[name];
  if (typeof value !== "string") {
    throw new Error(`SQLite returned an invalid ${name} value.`);
  }
  return value;
}

function dateField(row: SqlRow, name: string): Date {
  const value = textField(row, name);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`SQLite returned an invalid ${name} date.`);
  }
  return date;
}

function mapConversation(row: SqlRow): Conversation {
  return conversationSchema.parse({
    id: textField(row, "id"),
    createdAt: dateField(row, "created_at"),
  });
}

function mapMessage(row: SqlRow): ConversationMessage {
  const sequence = row.sequence;
  if (typeof sequence !== "number") {
    throw new Error("SQLite returned an invalid message sequence.");
  }
  return conversationMessageSchema.parse({
    sequence,
    conversationId: textField(row, "conversation_id"),
    role: textField(row, "role"),
    content: textField(row, "content"),
    createdAt: dateField(row, "created_at"),
  });
}

export class SqliteConversationStore implements ConversationStore, ConversationSummaryStore {
  private readonly db: DatabaseSync;
  private readonly findConversation: StatementSync;
  private readonly insertConversation: StatementSync;
  private readonly insertMessage: StatementSync;
  private readonly selectLastMessages: StatementSync;
  private readonly selectSummary: StatementSync;
  private readonly upsertSummary: StatementSync;
  private readonly countConversationMessages: StatementSync;
  private readonly selectMessagesBetween: StatementSync;

  constructor(path = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL CHECK (length(trim(content)) > 0),
        created_at TEXT NOT NULL,
        PRIMARY KEY (conversation_id, sequence)
      );

      CREATE INDEX IF NOT EXISTS messages_conversation_sequence_idx
        ON messages(conversation_id, sequence);

      CREATE TABLE IF NOT EXISTS conversation_summaries (
        conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id),
        summary TEXT NOT NULL
          CHECK (length(trim(summary)) > 0 AND length(summary) <= 900),
        summarized_through INTEGER NOT NULL CHECK (summarized_through > 0),
        updated_at TEXT NOT NULL
      );
    `);

    this.findConversation = this.db.prepare(
      "SELECT id, created_at FROM conversations WHERE id = ?",
    );
    this.insertConversation = this.db.prepare(
      "INSERT INTO conversations (id, created_at) VALUES (?, ?)",
    );
    this.insertMessage = this.db.prepare(`
      INSERT INTO messages (conversation_id, sequence, role, content, created_at)
      VALUES (
        ?,
        (SELECT COALESCE(MAX(sequence), 0) + 1 FROM messages WHERE conversation_id = ?),
        ?,
        ?,
        ?
      )
    `);
    this.selectLastMessages = this.db.prepare(`
      SELECT conversation_id, sequence, role, content, created_at
      FROM (
        SELECT conversation_id, sequence, role, content, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY sequence DESC
        LIMIT ?
      )
      ORDER BY sequence ASC
    `);
    this.selectSummary = this.db.prepare(
      `SELECT conversation_id, summary, summarized_through, updated_at
       FROM conversation_summaries WHERE conversation_id = ?`,
    );
    this.upsertSummary = this.db.prepare(`
      INSERT INTO conversation_summaries
        (conversation_id, summary, summarized_through, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        summary = excluded.summary,
        summarized_through = excluded.summarized_through,
        updated_at = excluded.updated_at
      WHERE excluded.summarized_through > conversation_summaries.summarized_through
    `);
    this.countConversationMessages = this.db.prepare(
      "SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ?",
    );
    this.selectMessagesBetween = this.db.prepare(`
      SELECT conversation_id, sequence, role, content, created_at
      FROM messages
      WHERE conversation_id = ? AND sequence >= ? AND sequence <= ?
      ORDER BY sequence ASC
    `);
  }

  async create(): Promise<Conversation> {
    const conversation = conversationSchema.parse({
      id: randomUUID(),
      createdAt: new Date(),
    });
    this.insertConversation.run(conversation.id, conversation.createdAt.toISOString());
    return conversation;
  }

  async append(
    conversationIdInput: string,
    roleInput: ConversationMessageRole,
    contentInput: string,
  ): Promise<void> {
    const conversationId = conversationIdSchema.parse(conversationIdInput);
    const message = newConversationMessageSchema.parse({
      role: roleInput,
      content: contentInput,
    });
    if (!this.findConversation.get(conversationId)) {
      throw new ConversationNotFoundError(conversationId);
    }
    this.insertMessage.run(
      conversationId,
      conversationId,
      message.role,
      message.content,
      new Date().toISOString(),
    );
  }

  async lastMessages(
    conversationIdInput: string,
    limitInput: number,
  ): Promise<ConversationMessage[] | null> {
    const conversationId = conversationIdSchema.parse(conversationIdInput);
    const limit = historyLimitSchema.parse(limitInput);
    if (!this.findConversation.get(conversationId)) {
      return null;
    }
    if (limit === 0) return [];
    return this.selectLastMessages.all(conversationId, limit).map(mapMessage);
  }

  async getSummary(conversationIdInput: string): Promise<ConversationSummary | null> {
    const conversationId = conversationIdSchema.parse(conversationIdInput);
    const row = this.selectSummary.get(conversationId);
    if (!row) return null;
    const through = row.summarized_through;
    if (typeof through !== "number") {
      throw new Error("SQLite returned an invalid summarized_through value.");
    }
    return conversationSummarySchema.parse({
      conversationId: textField(row, "conversation_id"),
      summary: textField(row, "summary"),
      summarizedThrough: through,
      updatedAt: dateField(row, "updated_at"),
    });
  }

  async countMessages(conversationIdInput: string): Promise<number> {
    const conversationId = conversationIdSchema.parse(conversationIdInput);
    const total = this.countConversationMessages.get(conversationId)?.total;
    if (typeof total !== "number") {
      throw new Error("SQLite returned an invalid message count.");
    }
    return total;
  }

  async messagesBetween(
    conversationIdInput: string,
    fromInput: number,
    toInput: number,
  ): Promise<ConversationMessage[]> {
    const conversationId = conversationIdSchema.parse(conversationIdInput);
    const from = z.number().int().positive().parse(fromInput);
    const to = z.number().int().positive().parse(toInput);
    return this.selectMessagesBetween.all(conversationId, from, to).map(mapMessage);
  }

  async saveSummary(
    conversationIdInput: string,
    summaryInput: string,
    summarizedThroughInput: number,
  ): Promise<void> {
    const summary = conversationSummarySchema.parse({
      conversationId: conversationIdInput,
      summary: summaryInput,
      summarizedThrough: summarizedThroughInput,
      updatedAt: new Date(),
    });
    if (!this.findConversation.get(summary.conversationId)) {
      throw new ConversationNotFoundError(summary.conversationId);
    }
    this.upsertSummary.run(
      summary.conversationId,
      summary.summary,
      summary.summarizedThrough,
      summary.updatedAt.toISOString(),
    );
  }

  close(): void {
    this.db.close();
  }
}
