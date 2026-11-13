import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "./client.js";

const userId = "8bd40b90-b1c8-4ab0-82a9-27be74b85e36";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function chatBody() {
  return {
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
}

test("sends a trimmed message to /chat below the configured API prefix", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const client = createApiClient({
    apiBaseUrl: "https://api.example/ops",
    userId,
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return response(200, chatBody());
    },
  });

  const result = await client.sendChat("  Check service  ", "conversation-1");

  assert.equal(requestUrl, "https://api.example/ops/chat");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    message: "Check service",
    userId,
    conversationId: "conversation-1",
    reflact: false,
  });
  assert.equal(result.answer, "The service is healthy.");
});

test("rejects malformed responses and explicit HTTP failures", async () => {
  const malformedClient = createApiClient({
    apiBaseUrl: "https://api.example",
    userId,
    fetchImpl: async () => response(200, { answer: "unvalidated" }),
  });
  await assert.rejects(malformedClient.sendChat("Check"));

  const failedClient = createApiClient({
    apiBaseUrl: "https://api.example",
    userId,
    fetchImpl: async () => response(500, { error: "Internal server error" }),
  });
  await assert.rejects(failedClient.sendChat("Check"), /HTTP 500/);
});

test("does not convert network failures into chat results", async () => {
  const networkError = new TypeError("fetch failed");
  const client = createApiClient({
    apiBaseUrl: "https://api.example",
    userId,
    fetchImpl: async () => {
      throw networkError;
    },
  });

  await assert.rejects(client.sendChat("Check"), (error) => error === networkError);
});

test("parses 202 actions and loads and decides restored actions under the API prefix", async () => {
  const action = {
    id: "b81ef9a6-9465-43ad-85a8-19b4d13c6a5e",
    requestId: "c1d9a7f1-a944-4ace-b7d8-6ab7f7c947b1",
    kind: "open_incident",
    summary: "Open an incident for checkout",
    details: {
      title: "Checkout unavailable",
      service: "checkout",
      severity: "high",
    },
    status: "pending",
  };
  const urls: string[] = [];
  const client = createApiClient({
    apiBaseUrl: "https://api.example/ops",
    userId,
    fetchImpl: async (input, init) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/chat")) {
        return response(202, {
          ...chatBody(),
          pendingActions: [action],
        });
      }
      if (url.includes("/actions?")) {
        return response(200, { actions: [action] });
      }
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        userId,
        decision: "approve",
      });
      return response(200, {
        id: action.id,
        status: "approved",
        result: {
          id: "incident-1",
          title: "Checkout unavailable",
          serviceId: "checkout",
          serviceName: "Checkout",
          severity: "high",
          status: "open",
          summary: null,
          createdAt: "2026-11-13T00:00:00.000Z",
          updatedAt: "2026-11-13T00:00:00.000Z",
          resolvedAt: null,
        },
      });
    },
  });

  const accepted = await client.sendChat("Create an incident");
  assert.equal("pendingActions" in accepted, true);
  if ("pendingActions" in accepted) {
    assert.deepEqual(accepted.pendingActions, [action]);
  }
  assert.deepEqual(await client.listActions(), [action]);
  assert.equal((await client.decideAction(action.id, "approve")).status, "approved");
  assert.deepEqual(urls, [
    "https://api.example/ops/chat",
    `https://api.example/ops/actions?userId=${userId}`,
    `https://api.example/ops/actions/${action.id}/decision`,
  ]);
});

test("rejects malformed 202 action responses", async () => {
  const client = createApiClient({
    apiBaseUrl: "https://api.example",
    userId,
    fetchImpl: async () => response(202, { ...chatBody(), pendingActions: [] }),
  });
  await assert.rejects(client.sendChat("Create an incident"), /invalid accepted chat response/);
});

test("keeps an incomplete pending action visible but without decision capability", async () => {
  const client = createApiClient({
    apiBaseUrl: "https://api.example",
    userId,
    fetchImpl: async () => response(202, {
      ...chatBody(),
      pendingActions: [{
        requestId: chatBody().requestId,
        kind: "open_incident",
        status: "pending",
        payload: { command: "must not reach the UI" },
      }],
    }),
  });

  const accepted = await client.sendChat("Create an incident");
  assert.equal("pendingActions" in accepted, true);
  if ("pendingActions" in accepted) {
    const [action] = accepted.pendingActions;
    assert.ok(action);
    assert.equal(action.id, undefined);
    assert.equal("details" in action, false);
    assert.equal("payload" in action, false);
  }
});
