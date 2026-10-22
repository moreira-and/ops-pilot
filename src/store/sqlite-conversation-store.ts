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
  newConversationMessageSchema,
  type Conversation,
  type ConversationMessage,
  type ConversationMessageRole,
  type ConversationStore,
} from "../services/conversation-store.js";

type SqlRow = Record<string, SQLOutputValue>;

const conversationIdSchema = z.string().trim().min(1);
const historyLimitSchema = z.number().int().min(0).max(12);

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

export class SqliteConversationStore implements ConversationStore {
  private readonly db: DatabaseSync;
  private readonly findConversation: StatementSync;
  private readonly insertConversation: StatementSync;
  private readonly insertMessage: StatementSync;
  private readonly selectLastMessages: StatementSync;

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

  close(): void {
    this.db.close();
  }
}
