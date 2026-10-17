import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { Server } from "node:http";
import { createApp } from "./server.js";
import type { ReasoningResult, ReasoningStrategy } from "../agents/reasoning.js";

function fakeStrategy(name: string, calls: string[]): ReasoningStrategy {
  return {
    name,
    async run(input) {
      calls.push(input);
      const result: ReasoningResult = {
        answer: `${name}: ${input}`,
        trace: [{ sequence: 0, type: "answer", content: `${name}: ${input}` }],
        metrics: { llmCalls: 1, latencyMs: 1 },
      };
      return result;
    },
  };
}

async function startServer(app: ReturnType<typeof createApp>) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected the HTTP server to listen on a TCP port.");
  }
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("POST /chat defaults to react and returns a reasoning result", async (t) => {
  const calls: string[] = [];
  const { server, url } = await startServer(
    createApp({ strategies: { react: fakeStrategy("react", calls) } }),
  );
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Summarize the alert" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    answer: "react: Summarize the alert",
    trace: [{ sequence: 0, type: "answer", content: "react: Summarize the alert" }],
    metrics: { llmCalls: 1, latencyMs: 1 },
  });
  assert.deepEqual(calls, ["Summarize the alert"]);
});

test("POST /chat returns Zod issues for an invalid request body", async (t) => {
  const { server, url } = await startServer(createApp({ strategies: {} }));
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "   ", reflact: "true" }),
  });
  const body = await response.json() as {
    error: string;
    issues: Array<{ path: string[] }>;
  };

  assert.equal(response.status, 400);
  assert.equal(body.error, "Invalid request body");
  assert.ok(body.issues.some(({ path }) => path.includes("message")));
  assert.ok(body.issues.some(({ path }) => path.includes("reflact")));

  const missingBodyResponse = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  const missingBody = await missingBodyResponse.json() as {
    error: string;
    issues: unknown[];
  };
  assert.equal(missingBodyResponse.status, 400);
  assert.equal(missingBody.error, "Invalid request body");
  assert.ok(missingBody.issues.length > 0);
});

test("POST /chat returns 400 for malformed JSON", async (t) => {
  const { server, url } = await startServer(createApp());
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid JSON" });
});

test("POST /chat rejects unknown strategies without running a strategy", async (t) => {
  const calls: string[] = [];
  const { server, url } = await startServer(
    createApp({ strategies: { react: fakeStrategy("react", calls) } }),
  );
  t.after(() => closeServer(server));

  for (const strategy of ["unknown", "toString", "__proto__"]) {
    const response = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Check the alert", strategy }),
    });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      error: "Unknown strategy",
      strategy,
    });
  }
  assert.deepEqual(calls, []);
});

test("POST /chat returns 504 when strategy execution exceeds the deadline", async (t) => {
  const pendingStrategy: ReasoningStrategy = {
    name: "pending",
    run: () => new Promise<ReasoningResult>(() => {}),
  };
  const { server, url } = await startServer(
    createApp({ strategies: { react: pendingStrategy }, timeoutMs: 10 }),
  );
  t.after(() => closeServer(server));

  const response = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Check the alert" }),
  });

  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), {
    error: "Strategy execution timed out",
  });
});

test("POST /chat returns 500 for strategy failures and invalid results", async (t) => {
  const failedResult: ReasoningStrategy = {
    name: "failed",
    async run() {
      return {
        answer: "[FAILED] strategy failure",
        trace: [{ sequence: 0, type: "answer", content: "[FAILED] strategy failure" }],
        metrics: { llmCalls: 0, latencyMs: 1 },
      };
    },
  };
  const invalidResult: ReasoningStrategy = {
    name: "invalid",
    async run() {
      return { answer: "", trace: [], metrics: { llmCalls: -1, latencyMs: -1 } };
    },
  };
  const failingStrategy: ReasoningStrategy = {
    name: "failing",
    async run() {
      throw new Error("private implementation detail");
    },
  };
  const { server, url } = await startServer(
    createApp({
      strategies: {
        failed: failedResult,
        invalid: invalidResult,
        failing: failingStrategy,
      },
    }),
  );
  t.after(() => closeServer(server));

  for (const strategy of ["failed", "invalid", "failing"]) {
    const response = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Check the alert", strategy }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "Internal server error",
    });
  }
});

test("POST /chat selects named strategies and reflects only when requested", async (t) => {
  const calls: string[] = [];
  const reflectedStrategies: string[] = [];
  const react = fakeStrategy("react", calls);
  const alternate = fakeStrategy("alternate", calls);
  const { server, url } = await startServer(
    createApp({
      strategies: { react, alternate },
      reflectionDecorator: (strategy) => {
        reflectedStrategies.push(strategy.name);
        return {
          name: `reflect:${strategy.name}`,
          async run(input, options) {
            const result = await strategy.run(input, options);
            return { ...result, answer: `reflected: ${result.answer}` };
          },
        };
      },
    }),
  );
  t.after(() => closeServer(server));

  const alternateResponse = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Investigate", strategy: "alternate" }),
  });
  assert.equal(alternateResponse.status, 200);
  assert.equal(
    (await alternateResponse.json() as ReasoningResult).answer,
    "alternate: Investigate",
  );

  const reflectedResponse = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Review", reflact: true }),
  });
  assert.equal(reflectedResponse.status, 200);
  assert.equal(
    (await reflectedResponse.json() as ReasoningResult).answer,
    "reflected: react: Review",
  );

  const plainResponse = await fetch(`${url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Check", reflact: false }),
  });
  assert.equal(plainResponse.status, 200);
  assert.equal(
    (await plainResponse.json() as ReasoningResult).answer,
    "react: Check",
  );
  assert.deepEqual(reflectedStrategies, ["react"]);
  assert.deepEqual(calls, ["Investigate", "Review", "Check"]);
});
