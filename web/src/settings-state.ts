import { z } from "zod";
import {
  parseApiBaseUrl,
  saveApiBaseUrl,
  type StorageLike,
} from "./api/settings.js";

export interface SettingsFormState {
  isOpen: boolean;
  draft: string;
  error: string | null;
}

export type SettingsFormEvent =
  | { type: "opened"; currentApiBaseUrl: string | null }
  | { type: "changed"; draft: string }
  | { type: "saveFailed"; error: string }
  | { type: "saved"; apiBaseUrl: string }
  | { type: "closed" };

export function createSettingsFormState(
  apiBaseUrl: string | null,
): SettingsFormState {
  return {
    isOpen: false,
    draft: apiBaseUrl ?? "",
    error: null,
  };
}

export function settingsFormReducer(
  state: SettingsFormState,
  event: SettingsFormEvent,
): SettingsFormState {
  switch (event.type) {
    case "opened":
      return {
        isOpen: true,
        draft: event.currentApiBaseUrl ?? "",
        error: null,
      };
    case "changed":
      return { ...state, draft: event.draft, error: null };
    case "saveFailed":
      return { ...state, error: event.error };
    case "saved":
      return { isOpen: false, draft: event.apiBaseUrl, error: null };
    case "closed":
      return { ...state, isOpen: false, error: null };
  }
}

export function saveSettingsForm(
  state: SettingsFormState,
  storage: StorageLike,
  currentApiBaseUrl: string | null,
): { state: SettingsFormState; apiBaseUrl: string | null } {
  try {
    const apiBaseUrl = saveApiBaseUrl(
      storage,
      parseApiBaseUrl(state.draft),
      currentApiBaseUrl,
    );
    return {
      state: settingsFormReducer(state, { type: "saved", apiBaseUrl }),
      apiBaseUrl,
    };
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    return {
      state: settingsFormReducer(state, {
        type: "saveFailed",
        error: error.issues[0]?.message ?? "Invalid API URL.",
      }),
      apiBaseUrl: null,
    };
  }
}
