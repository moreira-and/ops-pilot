import { createStrategyRegistry } from "./agents/index.js";
import { createApp } from "./http/server.js";
import { embed } from "./memory/embeddings.js";
import { MemoryStore } from "./memory/memory-store.js";
import { createLlmSummarizer } from "./services/summarizer.js";
import {
  createLearningExtractor,
  createLearningService,
} from "./services/learning-service.js";
import { SqliteConversationStore } from "./store/sqlite-conversation-store.js";
import { SqliteMemoryStore } from "./store/sqlite-memory-store.js";
import { SqliteRequestTraceStore } from "./store/sqlite-request-trace-store.js";
import { SqlitePendingActionStore } from "./store/sqlite-pending-action-store.js";
import { SqliteOpsStore } from "./store/sqlite-ops-store.js";
import { createPendingActionService } from "./services/pending-action-service.js";
import { DEMO_DATA } from "./scripts/demo-data.js";
import { DEMO_RUNBOOKS } from "./scripts/demo-runbooks.js";

if (process.argv[1]?.endsWith("/index.ts")) {
  const port = Number(process.env.PORT ?? 3000);
  const conversationStore = new SqliteConversationStore();
  const requestTraceStore = new SqliteRequestTraceStore();
  const pendingActionStore = new SqlitePendingActionStore();
  const operationalStore = new SqliteOpsStore(undefined, {
    data: DEMO_DATA,
    runbooks: DEMO_RUNBOOKS,
  });
  const pendingActionService = createPendingActionService(
    pendingActionStore,
    operationalStore,
  );
  const memoryStore = new MemoryStore(new SqliteMemoryStore(), embed);
  const learningService = createLearningService({
    extractor: createLearningExtractor(),
    remember: (userId, fact) => memoryStore.remember(userId, fact),
  });
  createApp({
    conversationStore,
    requestTraceStore,
    memoryStore,
    learningService,
    summarizer: createLlmSummarizer(),
    strategies: createStrategyRegistry(
      memoryStore,
      pendingActionService,
      operationalStore,
    ),
    pendingActionService,
  }).listen(port);
}