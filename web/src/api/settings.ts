import { z } from "zod";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BrowserSettings {
  apiBaseUrl: string | null;
  userId: string;
  conversationId: string | null;
}

const API_BASE_URL_KEY = "opspilot.apiBaseUrl";
const USER_ID_KEY = "opspilot.userId";
const CONVERSATION_KEY = "opspilot.activeConversation";

const apiBaseUrlSchema = z.string().trim().url().transform((value, context) => {
  const parsed = new URL(value);
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    value.includes("?") ||
    value.includes("#")
  ) {
    context.addIssue({
      code: "custom",
      message: "Use an HTTP(S) API URL without credentials, query, or fragment.",
    });
    return z.NEVER;
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path}`;
});

const browserUserIdSchema = z.string().uuid();

const storedConversationSchema = z.object({
  apiBaseUrl: apiBaseUrlSchema,
  userId: browserUserIdSchema,
  conversationId: z.string().trim().min(1),
}).strict();

export function parseApiBaseUrl(input: string): string {
  return apiBaseUrlSchema.parse(input);
}

export function getOrCreateUserId(
  storage: StorageLike,
  createId: () => string = () => globalThis.crypto.randomUUID(),
): string {
  const storedId = storage.getItem(USER_ID_KEY);
  if (storedId !== null) return browserUserIdSchema.parse(storedId);

  const userId = browserUserIdSchema.parse(createId());
  storage.setItem(USER_ID_KEY, userId);
  return userId;
}

export function loadBrowserSettings(
  storage: StorageLike,
  defaultApiBaseUrl?: string,
): BrowserSettings {
  const userId = getOrCreateUserId(storage);
  const storedApiBaseUrl = storage.getItem(API_BASE_URL_KEY);
  const apiBaseUrl = storedApiBaseUrl !== null
    ? parseApiBaseUrl(storedApiBaseUrl)
    : defaultApiBaseUrl === undefined
    ? null
    : parseApiBaseUrl(defaultApiBaseUrl);
  const storedConversation = storage.getItem(CONVERSATION_KEY);

  if (storedConversation === null) {
    return { apiBaseUrl, userId, conversationId: null };
  }

  const conversation = storedConversationSchema.parse(
    JSON.parse(storedConversation),
  );
  const isCurrentContext = conversation.apiBaseUrl === apiBaseUrl &&
    conversation.userId === userId;
  if (!isCurrentContext) storage.removeItem(CONVERSATION_KEY);

  return {
    apiBaseUrl,
    userId,
    conversationId: isCurrentContext ? conversation.conversationId : null,
  };
}

export function saveApiBaseUrl(
  storage: StorageLike,
  input: string,
  fallbackApiBaseUrl?: string | null,
): string {
  const apiBaseUrl = parseApiBaseUrl(input);
  const storedApiBaseUrl = storage.getItem(API_BASE_URL_KEY);
  const currentApiBaseUrl = storedApiBaseUrl === null
    ? fallbackApiBaseUrl === undefined || fallbackApiBaseUrl === null
      ? null
      : parseApiBaseUrl(fallbackApiBaseUrl)
    : parseApiBaseUrl(storedApiBaseUrl);

  storage.setItem(API_BASE_URL_KEY, apiBaseUrl);
  if (currentApiBaseUrl !== apiBaseUrl) {
    storage.removeItem(CONVERSATION_KEY);
  }
  return apiBaseUrl;
}

export function saveConversationId(
  storage: StorageLike,
  apiBaseUrlInput: string,
  userIdInput: string,
  conversationIdInput: string,
): void {
  const context = storedConversationSchema.parse({
    apiBaseUrl: apiBaseUrlInput,
    userId: userIdInput,
    conversationId: conversationIdInput,
  });
  storage.setItem(CONVERSATION_KEY, JSON.stringify(context));
}
