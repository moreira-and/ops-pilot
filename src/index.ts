import { createApp } from "./http/server.js";
import { embed } from "./memory/embeddings.js";
import { MemoryStore } from "./memory/memory-store.js";
import { SqliteConversationStore } from "./store/sqlite-conversation-store.js";
import { SqliteMemoryStore } from "./store/sqlite-memory-store.js";

if (process.argv[1]?.endsWith("/index.ts")) {
  const port = Number(process.env.PORT ?? 3000);
  const conversationStore = new SqliteConversationStore();
  const memoryStore = new MemoryStore(new SqliteMemoryStore(), embed);
  createApp({ conversationStore, memoryStore }).listen(port);
}