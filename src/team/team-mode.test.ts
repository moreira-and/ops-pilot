import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createPendingActionService } from "../services/pending-action-service.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { SqlitePendingActionStore } from "../store/sqlite-pending-action-store.js";
import { createTeamStrategy } from "./team-mode.js";

test("coordinates an isolated board and records every decision including done", async () => {
  const seen: string[][] = [];
  const strategy = createTeamStrategy({
    supervisor: async ({ board }) => {
      seen.push(board.map((entry) => entry.content));
      return board.length
        ? { next: "done", brief: "Resposta final" }
        : { next: "analista", brief: "Investigue" };
    },
    runRole: async () => ({ content: "Fato observado", status: "complete" }),
  });
  const [first, second] = await Promise.all([strategy.run("um"), strategy.run("dois")]);
  assert.equal(first.answer, "Resposta final");
  assert.deepEqual(first.trace.map((event) => event.type === "handoff" && event.to), ["analista", "done"]);
  assert.deepEqual(second.trace, first.trace);
  assert.equal(seen.filter((board) => board.length === 0).length, 2);
});

test("stops before a ninth dispatch and rejects invalid supervisor output", async () => {
  let calls = 0;
  const strategy = createTeamStrategy({
    supervisor: async () => ({ next: "analista", brief: "Leia" }),
    runRole: async () => {
      calls += 1;
      return { content: "Observação", status: "complete" };
    },
  });
  const result = await strategy.run("incidente");
  assert.equal(calls, 8);
  assert.match(result.answer, /incomplet/i);
  assert.equal(result.trace.length, 8);
  const invalid = createTeamStrategy({ supervisor: async () => ({ next: "unknown", brief: "x" }) });
  await assert.rejects(invalid.run("incidente"));
});

test("enforces role tool boundaries and incident writes remain pending", async (t) => {
    const operations = new SqliteOpsStore(":memory:");
    const pendingStore = new SqlitePendingActionStore(":memory:");
    t.after(() => { pendingStore.close(); operations.close(); });
    await operations.upsertDemoData({
      services: [{ id: "api", name: "API" }], alerts: [],
    }, []);
    const pendingActions = createPendingActionService(pendingStore, operations);
    const toolsByRole: Record<string, string[]> = {};
    const strategy = createTeamStrategy({
      operationalStore: operations,
      pendingActions,
      supervisor: async ({ board }) => board.length === 0
        ? { next: "analista", brief: "Investigue" }
        : board.length === 1
        ? { next: "executor", brief: "Abra incidente" }
        : { next: "done", brief: "Incidente aberto" },
      agentFactory: (role, tools) => {
        toolsByRole[role] = tools.map(({ name }) => name);
        return {
          async invoke(_input, config) {
            if (role === "analista") return { messages: [new AIMessage("Fatos")] };
            const open = tools.find(({ name }) => name === "open_incident");
            assert.ok(open);
            const output = await open.invoke(
              { title: "API", service: "api", severity: "high" },
              { context: config.context },
            );
            return { messages: [
              new ToolMessage({ content: String(output), name: "open_incident", tool_call_id: "call" }),
              new AIMessage("Pendente de aprovação"),
            ] };
          },
        };
      },
    });

    const result = await strategy.run("API", { userId: randomUUID(), requestId: randomUUID() });
    assert.deepEqual(toolsByRole.analista?.sort(), ["check_provider_status", "consultar_runbook", "list_alerts", "list_incidents"]);
    assert.deepEqual(toolsByRole.executor?.sort(), ["list_incidents", "open_incident", "resolve_incident"]);
    assert.match(result.answer, /pendente de aprovação/i);
    assert.equal((await operations.listIncidents("all")).length, 0);
});

test("planner uses a model without creating a tool-enabled agent", async () => {
  const strategy = createTeamStrategy({
    modelFactory: () => new FakeListChatModel({ responses: ["1. Investigar o alerta."] }),
    supervisor: async ({ board }) => board.length
      ? { next: "done", brief: board[0]!.content }
      : { next: "planejador", brief: "Elabore um plano" },
    agentFactory: () => { throw new Error("Planner must not receive tools."); },
  });
  const result = await strategy.run("Alerta");
  assert.match(result.answer, /Investigar o alerta/);
});
