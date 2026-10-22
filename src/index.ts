import { createApp } from "./http/server.js";
import { SqliteConversationStore } from "./store/sqlite-conversation-store.js";

if (process.argv[1]?.endsWith("/index.ts")) {
  const port = Number(process.env.PORT ?? 3000);
  const conversationStore = new SqliteConversationStore();
  createApp({ conversationStore }).listen(port);
}