import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrCreateUserId,
  loadBrowserSettings,
  parseApiBaseUrl,
  saveApiBaseUrl,
  saveConversationId,
} from "./settings.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test("validates and normalizes API base URLs without losing a path prefix", () => {
  assert.equal(
    parseApiBaseUrl(" https://api.example/proxy/opspilot/ "),
    "https://api.example/proxy/opspilot",
  );
  assert.equal(parseApiBaseUrl("http://localhost:3000/"), "http://localhost:3000");

  for (const invalid of [
    "ftp://api.example",
    "javascript:alert(1)",
    "https://user:password@api.example",
    "https://api.example?token=value",
    "https://api.example#fragment",
  ]) {
    assert.throws(() => parseApiBaseUrl(invalid));
  }
});

test("creates one valid browser ID and rejects an invalid stored ID", () => {
  const storage = new MemoryStorage();
  let generated = 0;
  const expectedId = "8bd40b90-b1c8-4ab0-82a9-27be74b85e36";
  const createId = () => {
    generated += 1;
    return expectedId;
  };

  assert.equal(getOrCreateUserId(storage, createId), expectedId);
  assert.equal(getOrCreateUserId(storage, createId), expectedId);
  assert.equal(generated, 1);

  storage.setItem("opspilot.userId", "not-a-uuid");
  assert.throws(() => getOrCreateUserId(storage, createId));
});

test("restores a conversation only for its saved API URL and browser ID", () => {
  const storage = new MemoryStorage();
  const apiBaseUrl = "https://api.example/prefix";
  const userId = "8bd40b90-b1c8-4ab0-82a9-27be74b85e36";

  saveApiBaseUrl(storage, apiBaseUrl);
  getOrCreateUserId(storage, () => userId);
  saveConversationId(storage, apiBaseUrl, userId, "conversation-1");
  assert.equal(loadBrowserSettings(storage).conversationId, "conversation-1");

  saveApiBaseUrl(storage, "https://other.example");
  assert.equal(loadBrowserSettings(storage).conversationId, null);
});

test("uses a validated public default only when no saved URL exists", () => {
  const storage = new MemoryStorage();
  assert.equal(
    loadBrowserSettings(storage, "https://api.example/").apiBaseUrl,
    "https://api.example",
  );
  assert.throws(() =>
    loadBrowserSettings(new MemoryStorage(), "https://user:pass@api.example")
  );
});
