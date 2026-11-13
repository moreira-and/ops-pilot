import assert from "node:assert/strict";
import test from "node:test";
import type { ChatResponse } from "../../src/contracts/war-room.js";
import { chatReducer, initialChatState } from "./chat-state.js";

const response: ChatResponse = {
  requestId: "c1d9a7f1-a944-4ace-b7d8-6ab7f7c947b1",
  conversationId: "conversation-1",
  answer: "The service is healthy.",
  trace: [
    { sequence: 0, type: "answer", node: "answer", content: "Healthy." },
  ],
  metrics: {
    llmCalls: 1,
    latencyMs: 12,
    historyMessages: 0,
    contextBreakdown: {
      system: 0,
      summary: 0,
      history: 0,
      memories: 0,
      message: 0,
    },
  },
};

test("keeps the submitted message paired with its validated response", () => {
  const pending = chatReducer(initialChatState, {
    type: "submitted",
    submissionId: "submission-1",
    message: "Check service",
  });
  const completed = chatReducer(pending, {
    type: "succeeded",
    submissionId: "submission-1",
    response,
  });

  assert.equal(completed.exchanges.length, 1);
  assert.equal(completed.exchanges[0]?.message, "Check service");
  assert.equal(completed.exchanges[0]?.response?.answer, response.answer);
  assert.equal(completed.exchanges[0]?.status, "complete");
});

test("records an explicit error without creating a successful response", () => {
  const pending = chatReducer(initialChatState, {
    type: "submitted",
    submissionId: "submission-2",
    message: "Check service",
  });
  const failed = chatReducer(pending, {
    type: "failed",
    submissionId: "submission-2",
    error: "API unavailable",
  });

  assert.equal(failed.exchanges[0]?.status, "failed");
  assert.equal(failed.exchanges[0]?.error, "API unavailable");
  assert.equal(failed.exchanges[0]?.response, null);
});
