import assert from "node:assert/strict";
import test from "node:test";
import {
  createSettingsFormState,
  saveSettingsForm,
  settingsFormReducer,
} from "./settings-state.js";
import {
  getOrCreateUserId,
  loadBrowserSettings,
  saveApiBaseUrl,
  saveConversationId,
  type StorageLike,
} from "./api/settings.js";

class MemoryStorage implements StorageLike {
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

const userId = "8bd40b90-b1c8-4ab0-82a9-27be74b85e36";

test("saves a valid URL, persists it across reload, and resets its old conversation", () => {
  const storage = new MemoryStorage();
  const previousUrl = "https://api.example";
  saveApiBaseUrl(storage, previousUrl);
  getOrCreateUserId(storage, () => userId);
  saveConversationId(storage, previousUrl, userId, "conversation-1");

  let state = settingsFormReducer(
    createSettingsFormState(previousUrl),
    { type: "opened", currentApiBaseUrl: previousUrl },
  );
  state = settingsFormReducer(state, {
    type: "changed",
    draft: "https://new-api.example/opspilot/",
  });
  const saved = saveSettingsForm(state, storage, previousUrl);

  assert.equal(saved.apiBaseUrl, "https://new-api.example/opspilot");
  assert.equal(saved.state.isOpen, false);
  assert.deepEqual(loadBrowserSettings(storage), {
    apiBaseUrl: "https://new-api.example/opspilot",
    userId,
    conversationId: null,
  });
});

test("invalid URL stays in the form and does not change persisted settings", () => {
  const storage = new MemoryStorage();
  saveApiBaseUrl(storage, "https://api.example");
  let state = settingsFormReducer(
    createSettingsFormState("https://api.example"),
    { type: "opened", currentApiBaseUrl: "https://api.example" },
  );
  state = settingsFormReducer(state, {
    type: "changed",
    draft: "javascript:alert(1)",
  });

  const saved = saveSettingsForm(state, storage, "https://api.example");

  assert.equal(saved.apiBaseUrl, null);
  assert.equal(saved.state.isOpen, true);
  assert.ok(saved.state.error);
  assert.equal(loadBrowserSettings(storage).apiBaseUrl, "https://api.example");
});

test("saving the unchanged default URL preserves the active conversation", () => {
  const storage = new MemoryStorage();
  const currentUrl = "https://api.example/opspilot";
  getOrCreateUserId(storage, () => userId);
  saveConversationId(storage, currentUrl, userId, "conversation-1");
  const formState = settingsFormReducer(
    createSettingsFormState(currentUrl),
    { type: "opened", currentApiBaseUrl: currentUrl },
  );

  const saved = saveSettingsForm(formState, storage, currentUrl);

  assert.equal(saved.apiBaseUrl, currentUrl);
  assert.equal(
    loadBrowserSettings(storage, currentUrl).conversationId,
    "conversation-1",
  );
});
