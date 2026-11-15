import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TraceViewer } from "./TraceViewer.js";

test("renders ordered role and terminal handoffs", () => {
  const html = renderToStaticMarkup(createElement(TraceViewer, {
    onClose: () => {},
    model: {
      status: "available", requestId: "c1d9a7f1-a944-4ace-b7d8-6ab7f7c947b1",
      events: [
        { sequence: 0, node: "supervisor", type: "handoff", from: "supervisor", to: "analista", brief: "Investigue" },
        { sequence: 1, node: "supervisor", type: "handoff", from: "supervisor", to: "done", brief: "Resumo" },
      ],
    },
  }));
  assert.match(html, /supervisor → analista: Investigue/);
  assert.match(html, /supervisor → done: Resumo/);
  assert.ok(html.indexOf("Investigue") < html.indexOf("Resumo"));
});
