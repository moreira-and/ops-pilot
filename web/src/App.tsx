import { useState } from "react";
import {
  loadBrowserSettings,
  saveConversationId,
} from "./api/settings.js";
import { ApiSettings } from "./components/ApiSettings.js";
import { ChatRoom } from "./components/ChatRoom.js";

export function App() {
  const [settings, setSettings] = useState(() =>
    loadBrowserSettings(
      window.localStorage,
      import.meta.env.VITE_API_BASE_URL,
    )
  );

  function updateConversationId(conversationId: string) {
    if (!settings.apiBaseUrl) return;
    saveConversationId(
      window.localStorage,
      settings.apiBaseUrl,
      settings.userId,
      conversationId,
    );
    setSettings((current) => ({ ...current, conversationId }));
  }

  function updateApiBaseUrl(apiBaseUrl: string) {
    setSettings((current) => ({
      ...current,
      apiBaseUrl,
      conversationId: current.apiBaseUrl === apiBaseUrl
        ? current.conversationId
        : null,
    }));
  }

  return (
    <main className="war-room">
      <header className="war-room__header">
        <div>
          <p className="eyebrow">OPS CONTROL</p>
          <h1>OpsPilot War Room</h1>
        </div>
        <ApiSettings
          apiBaseUrl={settings.apiBaseUrl}
          onSave={updateApiBaseUrl}
        />
      </header>
      <ChatRoom
        apiBaseUrl={settings.apiBaseUrl}
        userId={settings.userId}
        conversationId={settings.conversationId}
        onConversationIdChange={updateConversationId}
      />
    </main>
  );
}
