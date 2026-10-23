import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { buildContext } from "../context/context-builder.js";
import { ModelCallCounter } from "./metrics.js";
import { createReactStrategy, MEMORY_CAPABILITY_PROMPT } from "./react.js";

test("ReAct returns a typed ordered action/observation/answer trace", async () => {
  let recursionLimit = 0;
  let runtimeUserId = "";
  const strategy = createReactStrategy({
    tools: [],
    modelFactory: () => new ChatOpenAI({ model: "test/model" }),
    agentFactory: () => ({
      invoke: async (_input, config) => {
        recursionLimit = config?.recursionLimit ?? 0;
        runtimeUserId = (config as { context?: { userId?: string } } | undefined)
          ?.context?.userId ?? "";
        if (Array.isArray(config?.callbacks)) {
          for (const callback of config.callbacks) {
            if (callback instanceof ModelCallCounter) {
              callback.recordInvocation("model-call-1");
              callback.recordInvocation("model-call-1");
              callback.recordInvocation("model-call-retry");
            }
          }
        }
        return {
          messages: [
            new HumanMessage("List alerts"),
            new AIMessage({
              content: "",
              tool_calls: [
                {
                  id: "call-1",
                  name: "list_alerts",
                  args: { status: "firing" },
                  type: "tool_call",
                },
              ],
            }),
            new ToolMessage({ content: "[]", tool_call_id: "call-1", name: "list_alerts" }),
            new AIMessage("No firing alerts."),
          ],
        };
      },
    }),
  });

  const result = await strategy.run("List alerts", {
    maxIterations: 3,
    userId: "operator-1",
  });
  assert.equal(result.answer, "No firing alerts.");
  assert.equal(recursionLimit, 7);
  assert.equal(runtimeUserId, "operator-1");
  assert.equal(result.metrics.llmCalls, 2);
  assert.deepEqual(
    result.trace.map(({ type }) => type),
    ["action", "observation", "answer"],
  );
});

test("ReAct reports invalid user input before invoking the agent", async () => {
  let invoked = false;
  const strategy = createReactStrategy({
    tools: [],
    agentFactory: () => ({
      invoke: async () => {
        invoked = true;
        return { messages: [] };
      },
    }),
  });
  await assert.rejects(strategy.run("  "));
  assert.equal(invoked, false);
});

test("ReAct exposes forget_preference with trusted request context", async () => {
  let toolNames: string[] = [];
  let contextUserId = "";
  let systemPrompt = "";
  let receivedUserPrompt = "";
  const strategy = createReactStrategy({
    tools: [],
    memoryStore: {
      async recall() { return []; },
      forget() { return false; },
    },
    modelFactory: () => new ChatOpenAI({ model: "test/model" }),
    agentFactory: (_model, tools, options) => {
      toolNames = tools.map(({ name }) => name);
      systemPrompt = options.prompt;
      return {
        async invoke(input, config) {
          contextUserId = config?.context?.userId ?? "";
          const userMessage = input.messages[0];
          receivedUserPrompt = userMessage instanceof HumanMessage
            ? String(userMessage.content)
            : "";
          return { messages: [new AIMessage("Done.")] };
        },
      };
    },
  });

  const userPrompt = buildContext({
    message: "Forget my email preference.",
    summary: "An old preference.",
    history: [],
    memories: [],
  }, { summary: 0, history: 0, memories: 0 }).prompt;
  await strategy.run(userPrompt, { userId: "operator-1" });
  assert.deepEqual(toolNames, ["forget_preference"]);
  assert.equal(contextUserId, "operator-1");
  assert.equal(receivedUserPrompt, userPrompt);
  assert.equal(systemPrompt, MEMORY_CAPABILITY_PROMPT);
  assert.match(systemPrompt, /nunca afirme que uma preferência já foi salva/i);
});

test("ReAct returns explicit failure trace and metrics when graph execution fails", async () => {
  const strategy = createReactStrategy({
    tools: [],
    modelFactory: () => new ChatOpenAI({ model: "test/model" }),
    agentFactory: () => ({
      invoke: async () => {
        throw new Error("recursion limit reached");
      },
    }),
  });
  const result = await strategy.run("Inspect alerts", { maxIterations: 1 });

  assert.match(result.answer, /^\[FAILED\]/);
  assert.equal(result.trace[0]?.type, "observation");
  assert.equal(result.trace[1]?.type, "answer");
  assert.ok(result.metrics.latencyMs >= 0);
});
